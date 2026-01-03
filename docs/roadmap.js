        // GitHub Projects GraphQL API 설정
        const GITHUB_TOKEN = localStorage.getItem('github_token') || prompt('GitHub Personal Access Token을 입력하세요:\n(Settings → Developer settings → Personal access tokens → Generate new token)\n권한: repo, read:org, read:project');

        if (GITHUB_TOKEN) {
            localStorage.setItem('github_token', GITHUB_TOKEN);
        }

        const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

        // 데이터 저장소
        let projectsData = [];
        let epicsData = [];
        let iterationsData = []; // 이터레이션(스프린트) 목록
        let expandedProjects = new Set(); // 열린 프로젝트 추적
        let currentView = 'timeline'; // 현재 뷰 타입

        // GitHub API 호출 함수
        async function fetchGraphQL(query) {
            const response = await fetch(GRAPHQL_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query })
            });

            if (!response.ok) {
                throw new Error(`GitHub API Error: ${response.status}`);
            }

            const data = await response.json();
            if (data.errors) {
                throw new Error(data.errors[0].message);
            }

            return data.data;
        }

        // 이슈관리 프로젝트의 이터레이션(스프린트) 목록 가져오기
        async function fetchIterations() {
            const query = `
                query {
                    organization(login: "semicolon-devteam") {
                        projectV2(number: 1) {
                            title
                            field(name: "이터레이션") {
                                ... on ProjectV2IterationField {
                                    id
                                    name
                                    configuration {
                                        iterations {
                                            id
                                            title
                                            startDate
                                            duration
                                        }
                                    }
                                }
                            }
                            items(first: 100) {
                                nodes {
                                    id
                                    content {
                                        ... on Issue {
                                            number
                                            title
                                            url
                                            state
                                            body
                                            labels(first: 10) {
                                                nodes {
                                                    name
                                                }
                                            }
                                            repository {
                                                name
                                            }
                                        }
                                    }
                                    fieldValueByName(name: "이터레이션") {
                                        ... on ProjectV2ItemFieldIterationValue {
                                            title
                                            startDate
                                            duration
                                            iterationId
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const data = await fetchGraphQL(query);
            const project = data.organization.projectV2;

            // 이터레이션 설정 정보
            const iterations = project.field?.configuration?.iterations || [];

            // 각 이터레이션에 속한 이슈 매핑
            const iterationMap = new Map();
            iterations.forEach(iter => {
                iterationMap.set(iter.id, {
                    ...iter,
                    epics: []
                });
            });

            // 이슈들을 이터레이션에 할당 (전체 이슈 정보 포함)
            project.items.nodes.forEach(item => {
                if (item.content?.repository?.name === 'command-center' && item.fieldValueByName?.iterationId) {
                    const iterationId = item.fieldValueByName.iterationId;
                    if (iterationMap.has(iterationId)) {
                        iterationMap.get(iterationId).epics.push({
                            number: item.content.number,
                            title: item.content.title,
                            url: item.content.url,
                            state: item.content.state,
                            body: item.content.body,
                            labels: item.content.labels?.nodes?.map(l => l.name) || [],
                            iterationTitle: item.fieldValueByName.title
                        });
                    }
                }
            });

            return Array.from(iterationMap.values());
        }

        // 이번주 스프린트에 할당된 Task들로부터 사업 프로젝트 역산
        function buildWeeklySprintView(iterationsData, projectsData) {
            const now = new Date();

            // 이번주 스프린트 찾기
            const currentSprint = iterationsData.find(iteration => {
                const startDate = new Date(iteration.startDate);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + iteration.duration);
                return now >= startDate && now <= endDate;
            });

            if (!currentSprint) {
                return {
                    sprint: null,
                    businessProjects: []
                };
            }

            // 이번주 스프린트의 Task(Epic) 목록
            const weeklyTasks = currentSprint.epics;

            // Epic 번호 → 사업 프로젝트 매핑 구축 (body 파싱 기반)
            const epicToBusinessMap = new Map();
            projectsData.forEach(project => {
                // body에서 Epic 번호 파싱
                const epicNumbers = parseEpicNumbers(project.body || '');

                epicNumbers.forEach(epicNum => {
                    // 실제 Epic 데이터가 있으면 사용, 없으면 기본 정보만
                    const epicData = project.epics?.find(e => e.number === epicNum);

                    epicToBusinessMap.set(epicNum, {
                        businessProject: project,
                        epic: epicData || {
                            number: epicNum,
                            title: `Epic #${epicNum}`,
                            url: `https://github.com/semicolon-devteam/command-center/issues/${epicNum}`,
                            state: 'UNKNOWN',
                            tasks: [],
                            subIssues: []
                        }
                    });
                });
            });

            // 사업 프로젝트별로 이번주 할당된 Epic들 그룹화
            const businessMap = new Map();

            weeklyTasks.forEach(task => {
                const epicData = epicToBusinessMap.get(task.number);

                if (epicData) {
                    const businessNumber = epicData.businessProject.number;

                    if (!businessMap.has(businessNumber)) {
                        businessMap.set(businessNumber, {
                            project: epicData.businessProject,
                            weeklyEpics: []
                        });
                    }

                    businessMap.get(businessNumber).weeklyEpics.push({
                        ...epicData.epic,
                        sprintInfo: {
                            title: currentSprint.title,
                            startDate: currentSprint.startDate,
                            duration: currentSprint.duration
                        }
                    });
                }
            });

            return {
                sprint: currentSprint,
                businessProjects: Array.from(businessMap.values())
            };
        }

        // 이번 달 스프린트들에 할당된 Task들로부터 사업 프로젝트 역산 (주차별)
        function buildMonthlySprintView(iterationsData, projectsData) {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();

            // 이번 달에 속한 스프린트들 찾기
            const monthlySprints = iterationsData.filter(iteration => {
                const startDate = new Date(iteration.startDate);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + iteration.duration);

                // 스프린트가 이번 달과 겹치는지 확인
                return (startDate.getFullYear() === year && startDate.getMonth() === month) ||
                       (endDate.getFullYear() === year && endDate.getMonth() === month);
            }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

            if (monthlySprints.length === 0) {
                return {
                    month: { year, month },
                    sprints: []
                };
            }

            // Epic 번호 → 사업 프로젝트 매핑 구축 (body 파싱 기반)
            const epicToBusinessMap = new Map();
            projectsData.forEach(project => {
                // body에서 Epic 번호 파싱
                const epicNumbers = parseEpicNumbers(project.body || '');

                epicNumbers.forEach(epicNum => {
                    // 실제 Epic 데이터가 있으면 사용, 없으면 기본 정보만
                    const epicData = project.epics?.find(e => e.number === epicNum);

                    epicToBusinessMap.set(epicNum, {
                        businessProject: project,
                        epic: epicData || {
                            number: epicNum,
                            title: `Epic #${epicNum}`,
                            url: `https://github.com/semicolon-devteam/command-center/issues/${epicNum}`,
                            state: 'UNKNOWN',
                            tasks: [],
                            subIssues: []
                        }
                    });
                });
            });

            // 각 스프린트별로 사업 프로젝트 그룹화
            const sprintViews = monthlySprints.map(sprint => {
                const businessMap = new Map();

                sprint.epics.forEach(task => {
                    const epicData = epicToBusinessMap.get(task.number);

                    if (epicData) {
                        const businessNumber = epicData.businessProject.number;

                        if (!businessMap.has(businessNumber)) {
                            businessMap.set(businessNumber, {
                                project: epicData.businessProject,
                                epics: []
                            });
                        }

                        businessMap.get(businessNumber).epics.push(epicData.epic);
                    }
                });

                return {
                    sprint: sprint,
                    businessProjects: Array.from(businessMap.values())
                };
            });

            return {
                month: { year, month },
                sprints: sprintViews
            };
        }

        // 사업관리 프로젝트 데이터 가져오기
        async function fetchBusinessProjects() {
            const query = `
                query {
                    organization(login: "semicolon-devteam") {
                        projectV2(number: 6) {
                            items(first: 100) {
                                nodes {
                                    id
                                    content {
                                        ... on Issue {
                                            number
                                            title
                                            url
                                            body
                                            state
                                            createdAt
                                            updatedAt
                                            closedAt
                                            labels(first: 10) {
                                                nodes {
                                                    name
                                                }
                                            }
                                        }
                                    }
                                    fieldValues(first: 20) {
                                        nodes {
                                            ... on ProjectV2ItemFieldTextValue {
                                                text
                                                field {
                                                    ... on ProjectV2Field {
                                                        name
                                                    }
                                                }
                                            }
                                            ... on ProjectV2ItemFieldSingleSelectValue {
                                                name
                                                field {
                                                    ... on ProjectV2SingleSelectField {
                                                        name
                                                    }
                                                }
                                            }
                                            ... on ProjectV2ItemFieldDateValue {
                                                date
                                                field {
                                                    ... on ProjectV2Field {
                                                        name
                                                    }
                                                }
                                            }
                                            ... on ProjectV2ItemFieldNumberValue {
                                                number
                                                field {
                                                    ... on ProjectV2Field {
                                                        name
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const data = await fetchGraphQL(query);
            return data.organization.projectV2.items.nodes;
        }

        // Epic 데이터 가져오기 (이슈 번호 배열로)
        async function fetchEpics(epicNumbers) {
            if (!epicNumbers || epicNumbers.length === 0) return [];

            const epicQueries = epicNumbers.map((num, idx) => `
                epic${idx}: repository(owner: "semicolon-devteam", name: "command-center") {
                    issue(number: ${num}) {
                        number
                        title
                        url
                        body
                        state
                        createdAt
                        updatedAt
                        closedAt
                        projectItems(first: 5) {
                            nodes {
                                project {
                                    title
                                    number
                                }
                                fieldValueByName(name: "이터레이션") {
                                    ... on ProjectV2ItemFieldIterationValue {
                                        title
                                        startDate
                                        duration
                                        iterationId
                                    }
                                }
                            }
                        }
                    }
                }
            `).join('\n');

            const query = `
                query {
                    ${epicQueries}
                }
            `;

            const data = await fetchGraphQL(query);

            return Object.values(data)
                .map(repo => repo.issue)
                .filter(issue => issue !== null);
        }

        // 서브 이슈 데이터 가져오기
        async function fetchSubIssues(issueNumbers) {
            if (!issueNumbers || issueNumbers.length === 0) return [];

            const issueQueries = issueNumbers.map((num, idx) => `
                issue${idx}: repository(owner: "semicolon-devteam", name: "command-center") {
                    issue(number: ${num}) {
                        number
                        title
                        url
                        state
                    }
                }
            `).join('\n');

            const query = `
                query {
                    ${issueQueries}
                }
            `;

            const data = await fetchGraphQL(query);

            return Object.values(data)
                .map(repo => repo.issue)
                .filter(issue => issue !== null);
        }

        // Issue body에서 Epic 번호 추출 (자동 파싱)
        function parseEpicNumbers(body) {
            if (!body) return [];

            const epicNumbers = new Set();

            // 패턴 1: #71, #72 형식 (같은 레포)
            const hashPattern = /#(\d+)/g;
            let match;
            while ((match = hashPattern.exec(body)) !== null) {
                epicNumbers.add(parseInt(match[1]));
            }

            // 패턴 2: semicolon-devteam/command-center#71 형식
            const repoPattern = /semicolon-devteam\/command-center#(\d+)/g;
            while ((match = repoPattern.exec(body)) !== null) {
                epicNumbers.add(parseInt(match[1]));
            }

            // 패턴 3: GitHub URL 형식
            const urlPattern = /github\.com\/semicolon-devteam\/command-center\/issues\/(\d+)/g;
            while ((match = urlPattern.exec(body)) !== null) {
                epicNumbers.add(parseInt(match[1]));
            }

            return Array.from(epicNumbers).sort((a, b) => a - b);
        }

        // Epic 데이터 파싱 (Issue body에서 Task list와 Sub-issue 분리)
        function parseTaskList(body) {
            if (!body) return { tasks: [], subIssues: [] };

            const taskRegex = /- \[([ x])\] (.+?)(?:\((.+?)\))?$/gm;
            const tasks = [];
            const subIssues = [];
            let match;

            while ((match = taskRegex.exec(body)) !== null) {
                const completed = match[1] === 'x';
                const fullText = match[2].trim();
                const note = match[3] || '';

                // #숫자 패턴 감지 (서브 이슈)
                const issueMatch = fullText.match(/^#(\d+)\s*(.*)$/);
                if (issueMatch) {
                    subIssues.push({
                        number: parseInt(issueMatch[1]),
                        title: issueMatch[2].trim() || `Issue #${issueMatch[1]}`,
                        completed: completed,
                        note: note
                    });
                } else {
                    tasks.push({
                        completed: completed,
                        title: fullText,
                        note: note
                    });
                }
            }

            return { tasks, subIssues };
        }

        // 필드 값 추출 헬퍼
        function getFieldValue(item, fieldName) {
            const field = item.fieldValues?.nodes?.find(f => f.field?.name === fieldName);
            return field?.text || field?.name || field?.date || field?.number || null;
        }

        // 데이터 처리 및 렌더링
        async function loadProjects() {
            const contentDiv = document.getElementById('content');
            const statsDiv = document.getElementById('stats');

            try {
                contentDiv.innerHTML = '<div class="loading">데이터를 불러오는 중입니다...</div>';

                // 이터레이션(스프린트) 목록 먼저 로드
                contentDiv.innerHTML = '<div class="loading">스프린트 정보 로드 중...</div>';
                iterationsData = await fetchIterations();

                const items = await fetchBusinessProjects();

                // 데이터 파싱
                projectsData = await Promise.all(items.map(async item => {
                    const content = item.content;
                    if (!content) return null;

                    const projectNumber = content.number;

                    // Epic 번호 자동 파싱 (Issue body에서)
                    const epicNumbers = parseEpicNumbers(content.body);

                    // Epic 데이터 로드
                    let epics = [];
                    if (epicNumbers.length > 0) {
                        contentDiv.innerHTML = `<div class="loading">${content.title} Epic 데이터 로드 중...</div>`;
                        epics = await fetchEpics(epicNumbers);

                        // Epic 처리 및 서브 이슈 로드
                        epics = await Promise.all(epics.map(async epic => {
                            const parsed = parseTaskList(epic.body);

                            // 서브 이슈 상세 정보 가져오기
                            let subIssuesData = [];
                            if (parsed.subIssues.length > 0) {
                                const subIssueNumbers = parsed.subIssues.map(si => si.number);
                                const fetchedSubIssues = await fetchSubIssues(subIssueNumbers);

                                subIssuesData = parsed.subIssues.map(si => {
                                    const fetched = fetchedSubIssues.find(f => f.number === si.number);
                                    return {
                                        number: si.number,
                                        title: fetched ? fetched.title : si.title,
                                        url: fetched ? fetched.url : `https://github.com/semicolon-devteam/command-center/issues/${si.number}`,
                                        state: fetched ? fetched.state : 'UNKNOWN',
                                        completed: si.completed,
                                        note: si.note
                                    };
                                });
                            }

                            return {
                                number: epic.number,
                                title: epic.title,
                                url: epic.url,
                                state: epic.state,
                                createdAt: epic.createdAt,
                                updatedAt: epic.updatedAt,
                                closedAt: epic.closedAt,
                                tasks: parsed.tasks,
                                subIssues: subIssuesData
                            };
                        }));
                    }

                    return {
                        number: projectNumber,
                        title: content.title,
                        url: content.url,
                        body: content.body,
                        state: content.state,
                        createdAt: content.createdAt,
                        updatedAt: content.updatedAt,
                        closedAt: content.closedAt,
                        status: getFieldValue(item, '상태') || getFieldValue(item, 'Status'),
                        category: getFieldValue(item, '카테고리'),
                        targetDate: getFieldValue(item, '목표일'),
                        budget: getFieldValue(item, '예산'),
                        priority: getFieldValue(item, '중요도'),
                        revenue: getFieldValue(item, '월간 수익'),
                        epics: epics
                    };
                }));

                projectsData = projectsData.filter(p => p !== null);

                // 통계 계산
                renderStats(projectsData);

                // 현재 뷰 렌더링
                renderCurrentView();

                // 마지막 업데이트 시간
                document.getElementById('lastUpdate').textContent = new Date().toLocaleString('ko-KR');

            } catch (error) {
                contentDiv.innerHTML = `
                    <div class="error">
                        <strong>오류 발생:</strong> ${error.message}<br><br>
                        GitHub Personal Access Token이 필요합니다.<br>
                        <button onclick="resetToken()">토큰 재설정</button>
                    </div>
                `;
            }
        }

        // 통계 렌더링
        function renderStats(projects) {
            const total = projects.length;
            const active = projects.filter(p => p.status?.includes('진행') || p.status?.includes('작업')).length;
            const completed = projects.filter(p => p.status?.includes('완료') || p.status === '✅ 완료').length;
            const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);

            document.getElementById('stats').innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">전체 프로젝트</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${active}</div>
                    <div class="stat-label">진행중</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${completed}</div>
                    <div class="stat-label">완료</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">₩${(totalBudget / 10000).toFixed(0)}만</div>
                    <div class="stat-label">총 예산</div>
                </div>
            `;
        }

        // View 전환
        function switchView(viewType) {
            currentView = viewType;

            // 탭 active 상태 업데이트
            document.querySelectorAll('.view-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.getAttribute('data-view') === viewType) {
                    tab.classList.add('active');
                }
            });

            renderCurrentView();
        }

        // 현재 뷰 렌더링
        function renderCurrentView() {
            const filterStatus = document.getElementById('filterStatus').value;
            let filteredProjects = filterProjects(projectsData, filterStatus);

            switch (currentView) {
                case 'timeline':
                    renderTimeline(filteredProjects);
                    break;
                case 'year':
                    renderYearView(filteredProjects);
                    break;
                case 'month':
                    renderMonthView(filteredProjects);
                    break;
                case 'sprint':
                    renderSprintView(filteredProjects);
                    break;
            }
        }

        // 프로젝트 필터링
        function filterProjects(projects, filterStatus) {
            if (filterStatus === 'all') return projects;

            return projects.filter(p => {
                if (filterStatus === 'active') {
                    return p.status?.includes('진행') || p.status?.includes('작업');
                } else if (filterStatus === 'completed') {
                    return p.status?.includes('완료') || p.status === '✅ 완료';
                } else if (filterStatus === 'pending') {
                    return p.status?.includes('대기') || p.status?.includes('승인') || p.status?.includes('계획');
                }
                return true;
            });
        }

        // 타임라인 렌더링 (Gantt 차트 + Epic 상세 카드)
        function renderTimeline(projects) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();

            // 6개월 타임라인 생성
            const months = [];
            for (let i = 0; i < 6; i++) {
                const monthDate = new Date(currentYear, currentMonth - 1 + i, 1);
                months.push({
                    date: monthDate,
                    year: monthDate.getFullYear(),
                    month: monthDate.getMonth(),
                    label: `${monthDate.getFullYear()}년 ${monthDate.getMonth() + 1}월`
                });
            }

            // 목표일이 있는 프로젝트만 필터링
            const projectsWithDate = projects.filter(p => p.targetDate);

            let html = `
                <div class="gantt-timeline">
                    <h2 style="margin-bottom: 20px; color: #58a6ff;">📅 로드맵 타임라인 (Gantt)</h2>

                    <!-- 타임라인 헤더 -->
                    <div class="timeline-header" style="display: grid; grid-template-columns: 250px repeat(${months.length}, 1fr); gap: 0; margin-bottom: 10px; position: sticky; top: 0; background: #0d1117; z-index: 10; padding: 10px 0; border-bottom: 2px solid #30363d;">
                        <div style="font-weight: 600; color: #8b949e; padding: 10px;">프로젝트</div>
                        ${months.map((m, idx) => {
                            const isCurrent = m.year === currentYear && m.month === currentMonth;
                            return `
                                <div style="text-align: center; padding: 10px; font-weight: 600; color: ${isCurrent ? '#58a6ff' : '#8b949e'}; border-left: 1px solid #21262d;">
                                    ${m.year.toString().slice(2)}.${(m.month + 1).toString().padStart(2, '0')}
                                    ${isCurrent ? '<div style="font-size: 0.7em; color: #1f6feb;">▼ 현재</div>' : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
            `;

            projectsWithDate.forEach(project => {
                const targetDate = new Date(project.targetDate);
                const progress = calculateProjectProgress(project);

                // 타임라인 바 위치 계산
                const monthIndex = months.findIndex(m =>
                    m.year === targetDate.getFullYear() && m.month === targetDate.getMonth()
                );

                const statusClass = getStatusClass(project.status);

                html += `
                    <div class="timeline-row" style="display: grid; grid-template-columns: 250px repeat(${months.length}, 1fr); gap: 0; border-bottom: 1px solid #21262d; padding: 8px 0;">
                        <div style="padding: 8px; display: flex; align-items: center; gap: 8px;">
                            <span class="project-status ${statusClass}" style="font-size: 0.75em; padding: 2px 8px;">${project.status || '상태없음'}</span>
                            <a href="${project.url}" target="_blank" style="color: #c9d1d9; text-decoration: none; font-size: 0.9em;">
                                ${project.title}
                            </a>
                        </div>
                        ${months.map((m, idx) => {
                            if (idx === monthIndex) {
                                const dayOfMonth = targetDate.getDate();
                                const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
                                const position = (dayOfMonth / daysInMonth) * 100;

                                return `
                                    <div style="position: relative; border-left: 1px solid #21262d; padding: 4px;">
                                        <div style="position: absolute; left: ${position}%; transform: translateX(-50%); width: 10px; height: 10px; background: ${progress === 100 ? '#3fb950' : progress > 0 ? '#d29922' : '#8b949e'}; border-radius: 50%; border: 2px solid #0d1117; z-index: 2;" title="${project.title} (${project.targetDate})\n진행률: ${progress}%"></div>
                                        ${project.epics && project.epics.length > 0 ? `
                                            <div style="position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); height: 24px; background: linear-gradient(90deg, transparent, ${progress === 100 ? '#3fb95044' : progress > 0 ? '#d2992244' : '#8b949e44'} ${position}%, transparent); border-radius: 4px;"></div>
                                        ` : ''}
                                    </div>
                                `;
                            } else {
                                return `<div style="border-left: 1px solid #21262d;"></div>`;
                            }
                        }).join('')}
                    </div>
                `;
            });

            html += '</div>';

            // Epic 상세 정보 추가 (월별 카드 뷰)
            html += '<div style="margin-top: 50px; padding-top: 30px; border-top: 3px solid #30363d;">';
            html += '<h2 style="margin-bottom: 20px; color: #58a6ff;">📋 프로젝트 상세 (Epic 포함)</h2>';

            // 목표일 기준 그룹핑
            const grouped = {};
            const noDateProjects = [];

            projects.forEach(project => {
                if (!project.targetDate) {
                    noDateProjects.push(project);
                    return;
                }

                const date = new Date(project.targetDate);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

                if (!grouped[monthKey]) {
                    grouped[monthKey] = [];
                }
                grouped[monthKey].push(project);
            });

            // 날짜 역순 정렬 (최신이 먼저)
            const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

            sortedMonths.forEach(monthKey => {
                const [year, month] = monthKey.split('-');
                const monthName = `${year}년 ${parseInt(month)}월`;

                html += `
                    <div class="month-section">
                        <div class="month-header">${monthName}</div>
                `;

                // 월 내에서도 최신순 정렬 (목표일 기준)
                const monthProjects = grouped[monthKey].sort((a, b) => {
                    return new Date(b.targetDate) - new Date(a.targetDate);
                });

                monthProjects.forEach(project => {
                    html += renderProject(project);
                });

                html += '</div>';
            });

            // 목표일 없는 프로젝트들 (맨 마지막에 표시)
            if (noDateProjects.length > 0) {
                html += `
                    <div class="month-section">
                        <div class="month-header">목표일 미정</div>
                `;

                noDateProjects.forEach(project => {
                    html += renderProject(project);
                });

                html += '</div>';
            }

            html += '</div>';

            document.getElementById('content').innerHTML = html;
        }

        // 프로젝트 카드 렌더링
        function renderProject(project) {
            const statusClass = getStatusClass(project.status);

            // Epic 전체 진행률 계산
            let totalTasks = 0;
            let completedTasks = 0;

            if (project.epics && project.epics.length > 0) {
                project.epics.forEach(epic => {
                    if (epic.tasks) {
                        totalTasks += epic.tasks.length;
                        completedTasks += epic.tasks.filter(t => t.completed).length;
                    }
                    if (epic.subIssues) {
                        totalTasks += epic.subIssues.length;
                        completedTasks += epic.subIssues.filter(si => si.state === 'CLOSED').length;
                    }
                });
            }

            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            return `
                <div class="project-group ${ expandedProjects.has(project.number) ? 'expanded' : 'collapsed'}" id="project-${project.number}">
                    <div class="project-header" onclick="toggleProject(${project.number})">
                        <div>
                            <div class="project-title">
                                <span class="expand-icon">▶</span>
                                <a href="${project.url}" target="_blank" style="color: inherit; text-decoration: none;">
                                    ${project.title}
                                </a>
                                <span class="project-status ${statusClass}">${project.status || '상태 없음'}</span>
                            </div>
                            <div class="project-meta">
                                ${project.targetDate ? `<span>📅 ${project.targetDate}</span>` : ''}
                                ${project.budget ? `<span>💰 ₩${(project.budget / 10000).toFixed(0)}만</span>` : ''}
                                ${project.revenue ? `<span>💵 월 ₩${project.revenue}</span>` : ''}
                                ${project.category ? `<span>📂 ${project.category}</span>` : ''}
                                ${project.epics ? `<span>📊 Epic ${project.epics.length}개</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="project-body">
                        ${totalTasks > 0 ? `
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                            <div class="progress-text">${progress}% 완료 (${completedTasks}/${totalTasks} Task)</div>
                        ` : ''}
                        ${renderEpics(project.epics)}
                    </div>
                </div>
            `;
        }

        // Epic 리스트 렌더링
        function renderEpics(epics) {
            if (!epics || epics.length === 0) {
                return '<p style="color: #8b949e; padding: 10px 0;">Epic 정보가 없습니다.</p>';
            }

            return epics.map(epic => {
                const epicProgress = calculateProgress(epic.tasks);

                // Epic 상태 판단 (하이브리드)
                let epicStatus = '';
                let epicStatusClass = '';

                if (epic.state === 'CLOSED') {
                    if (epicProgress === 100) {
                        epicStatus = '완료';
                        epicStatusClass = 'status-completed';
                    } else if (epicProgress === 0) {
                        epicStatus = '닫힘 (Task 없음)';
                        epicStatusClass = 'status-completed';
                    } else {
                        epicStatus = `닫힘 (Task ${epicProgress}%)`;
                        epicStatusClass = 'status-pending';
                    }
                } else {
                    if (epicProgress === 0) {
                        epicStatus = '시작 전';
                        epicStatusClass = 'status-planning';
                    } else {
                        epicStatus = `진행중 (${epicProgress}%)`;
                        epicStatusClass = 'status-active';
                    }
                }

                return `
                    <div class="epic-group" style="margin: 15px 0; padding: 15px; background: #161b22; border-radius: 6px; border-left: 3px solid #1f6feb;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <div>
                                <a href="${epic.url}" target="_blank" style="color: #58a6ff; text-decoration: none; font-weight: 600;">
                                    #${epic.number} ${epic.title}
                                </a>
                                <span class="project-status ${epicStatusClass}" style="margin-left: 8px;">
                                    ${epicStatus}
                                </span>
                            </div>
                            <div style="color: #8b949e; font-size: 0.9em;">
                                ${epic.tasks && epic.tasks.length > 0 ? `${epic.tasks.filter(t => t.completed).length}/${epic.tasks.length} Tasks` : ''}
                                ${epic.subIssues && epic.subIssues.length > 0 ? ` • ${epic.subIssues.filter(si => si.state === 'CLOSED').length}/${epic.subIssues.length} Sub-Issues` : ''}
                            </div>
                        </div>
                        ${renderTasksAndSubIssues(epic.tasks, epic.subIssues, epicProgress, epic.number)}
                    </div>
                `;
            }).join('');
        }

        // Task와 Sub-Issue 분리 렌더링
        function renderTasksAndSubIssues(tasks, subIssues, progress, epicNumber = null) {
            let html = '';

            // Tasks 섹션
            if (tasks && tasks.length > 0) {
                html += `
                    <div style="margin-top: 15px;">
                        <h4 style="color: #8b949e; font-size: 0.95em; margin-bottom: 8px; font-weight: 600;">📋 Tasks</h4>
                        <div class="task-list">
                            ${tasks.map((task, index) => `
                                <div class="task-item">
                                    <span class="task-checkbox ${task.completed ? 'checked' : ''}"
                                          ${epicNumber ? `onclick="updateTaskCheckbox(${epicNumber}, ${index}, ${!task.completed})" style="cursor: pointer;"` : ''}
                                          title="${epicNumber ? 'Click to toggle on GitHub' : 'Read-only'}">
                                    </span>
                                    <span class="${task.completed ? 'task-completed' : ''}">${task.title}</span>
                                    ${task.note ? `<span style="color: #8b949e; font-size: 0.85em;">(${task.note})</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Sub-Issues 섹션
            if (subIssues && subIssues.length > 0) {
                html += `
                    <div style="margin-top: 15px;">
                        <h4 style="color: #8b949e; font-size: 0.95em; margin-bottom: 8px; font-weight: 600;">🔗 Sub-Issues</h4>
                        <div class="task-list">
                            ${subIssues.map(si => `
                                <div class="task-item">
                                    <span class="task-checkbox ${si.state === 'CLOSED' ? 'checked' : ''}" title="Read-only (from GitHub issue state)"></span>
                                    <a href="${si.url}" target="_blank" class="task-link ${si.state === 'CLOSED' ? 'task-completed' : ''}" style="color: ${si.state === 'CLOSED' ? '#8b949e' : '#58a6ff'};">
                                        #${si.number} ${si.title}
                                    </a>
                                    ${si.note ? `<span style="color: #8b949e; font-size: 0.85em;">(${si.note})</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            if (!html) {
                return '<p style="color: #8b949e; font-size: 0.9em; margin: 10px 0;">Task 및 Sub-Issue 정보가 없습니다.</p>';
            }

            return html;
        }

        // Task 리스트 렌더링 (Epic 번호 포함) - 하위 호환성 유지
        function renderTasks(tasks, progress, epicNumber = null) {
            if (!tasks || tasks.length === 0) {
                return '<p style="color: #8b949e; font-size: 0.9em; margin: 5px 0;">Task 정보가 없습니다.</p>';
            }

            return `
                <div class="task-list" style="margin-top: 10px;">
                    ${tasks.map((task, index) => `
                        <div class="task-item">
                            <span class="task-checkbox ${task.completed ? 'checked' : ''}"
                                  ${epicNumber ? `onclick="updateTaskCheckbox(${epicNumber}, ${index}, ${!task.completed})" style="cursor: pointer;"` : ''}
                                  title="${epicNumber ? 'Click to toggle on GitHub' : 'Read-only'}">
                            </span>
                            <span class="${task.completed ? 'task-completed' : ''}">${task.title}</span>
                            ${task.note ? `<span style="color: #8b949e; font-size: 0.85em;">${task.note}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // 헬퍼 함수들
        function getStatusClass(status) {
            if (!status) return '';
            if (status.includes('진행') || status.includes('작업')) return 'status-active';
            if (status.includes('완료')) return 'status-completed';
            if (status.includes('대기') || status.includes('승인')) return 'status-pending';
            if (status.includes('계획')) return 'status-planning';
            return '';
        }

        function calculateProgress(tasks) {
            if (!tasks || tasks.length === 0) return 0;
            const completed = tasks.filter(t => t.completed).length;
            return Math.round((completed / tasks.length) * 100);
        }

        function toggleProject(number) {
            const element = document.getElementById(`project-${number}`);
            element.classList.toggle('expanded');
            element.classList.toggle('collapsed');

            // 상태 추적
            if (element.classList.contains('expanded')) {
                expandedProjects.add(number);
            } else {
                expandedProjects.delete(number);
            }
        }

        function resetToken() {
            localStorage.removeItem('github_token');
            location.reload();
        }

        // Year View 렌더링 (분기별)
        function renderYearView(projects) {
            const year = new Date().getFullYear();
            const quarters = [
                { name: 'Q1', months: [1, 2, 3], label: '1-3월' },
                { name: 'Q2', months: [4, 5, 6], label: '4-6월' },
                { name: 'Q3', months: [7, 8, 9], label: '7-9월' },
                { name: 'Q4', months: [10, 11, 12], label: '10-12월' }
            ];

            let html = `<div class="year-view"><h2 style="margin-bottom: 20px; color: #58a6ff;">${year}년 로드맵 - 분기별 현황</h2>`;

            quarters.forEach(quarter => {
                const quarterProjects = projects.filter(p => {
                    if (!p.targetDate && !p.updatedAt) return false;

                    const checkDate = p.targetDate || p.updatedAt;
                    const date = new Date(checkDate);
                    return date.getFullYear() === year && quarter.months.includes(date.getMonth() + 1);
                });

                if (quarterProjects.length === 0) return;

                // 진행률별 정렬
                const sorted = quarterProjects.sort((a, b) => {
                    const progressA = calculateProjectProgress(a);
                    const progressB = calculateProjectProgress(b);
                    return progressB - progressA;
                });

                html += `
                    <div class="quarter-section">
                        <div class="quarter-header">
                            <span>${quarter.name} (${quarter.label})</span>
                            <span style="font-size: 0.7em; color: #8b949e;">진행 ${sorted.length}개</span>
                        </div>
                `;

                sorted.forEach(p => {
                    const progress = calculateProjectProgress(p);
                    const statusIcon = progress === 100 ? '🔵' : progress > 0 ? '🟢' : '⚪';
                    const isDelayed = p.targetDate && new Date(p.targetDate) < new Date() && progress < 100;

                    html += `
                        <div class="activity-item" style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span>${isDelayed ? '🔴' : statusIcon}</span>
                                <a href="${p.url}" target="_blank" style="color: #58a6ff; text-decoration: none; margin-left: 8px;">
                                    ${p.title}
                                </a>
                                ${p.epics && p.epics.length > 0 ? `<span style="color: #8b949e; font-size: 0.9em; margin-left: 10px;">(Epic ${p.epics.length}개)</span>` : ''}
                            </div>
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div style="width: 200px; background: #21262d; height: 8px; border-radius: 4px; overflow: hidden;">
                                    <div style="width: ${progress}%; background: ${progress === 100 ? '#238636' : '#1f6feb'}; height: 100%;"></div>
                                </div>
                                <span style="min-width: 50px; text-align: right; color: ${progress === 100 ? '#7ee787' : '#58a6ff'}; font-weight: 600;">${progress}%</span>
                            </div>
                        </div>
                    `;
                });

                html += '</div>';
            });

            html += '</div>';
            document.getElementById('content').innerHTML = html;
        }

        // Month View 렌더링 (주간 활동)
        function renderMonthView(projects) {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();

            // 현재 월의 주차 계산
            const weeks = [];
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);

            let weekStart = new Date(firstDay);
            while (weekStart <= lastDay) {
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                if (weekEnd > lastDay) weekEnd.setTime(lastDay.getTime());

                weeks.push({
                    start: new Date(weekStart),
                    end: new Date(weekEnd)
                });

                weekStart.setDate(weekStart.getDate() + 7);
            }

            const monthlyData = buildMonthlySprintView(iterationsData, projects);

            if (monthlyData.sprints.length === 0) {
                document.getElementById('content').innerHTML = `
                    <div class="month-view">
                        <h2 style="margin-bottom: 20px; color: #58a6ff;">${year}년 ${month + 1}월 업무</h2>
                        <div style="text-align: center; padding: 60px 20px; color: #8b949e;">
                            <p style="font-size: 1.2em; margin-bottom: 10px;">이번 달 스프린트가 없습니다</p>
                            <p style="font-size: 0.9em;">스프린트를 설정하면 월간 업무가 표시됩니다</p>
                        </div>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="month-view">
                    <h2 style="margin-bottom: 20px; color: #58a6ff;">📆 ${year}년 ${month + 1}월 - 주차별 업무</h2>
                    <div style="background: #161b22; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                        <div style="color: #8b949e; font-size: 0.95em;">
                            이번 달 스프린트: ${monthlyData.sprints.length}개
                            ${monthlyData.sprints.reduce((sum, s) => sum + s.businessProjects.length, 0) > 0 ?
                                `• 활동 중인 사업: ${new Set(monthlyData.sprints.flatMap(s => s.businessProjects.map(bp => bp.project.number))).size}개` : ''}
                        </div>
                    </div>
            `;

            // 각 스프린트(주차)별로 렌더링
            monthlyData.sprints.forEach((sprintView, index) => {
                const sprint = sprintView.sprint;
                const startDate = new Date(sprint.startDate);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + sprint.duration - 1);

                const isCurrentSprint = now >= startDate && now <= endDate;
                const weekClass = isCurrentSprint ? 'week-section current-week' : 'week-section';

                html += `
                    <div class="${weekClass}">
                        <div class="week-header">
                            <div>
                                <span style="font-weight: 600;">${sprint.title}</span>
                                <span style="margin-left: 10px; color: #8b949e; font-size: 0.9em;">
                                    ${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}
                                </span>
                                ${isCurrentSprint ? '<span style="background: #1f6feb; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; margin-left: 10px;">이번 주</span>' : ''}
                            </div>
                            <span style="font-size: 0.85em; color: #8b949e;">
                                사업 ${sprintView.businessProjects.length}개 • Epic ${sprint.epics.length}개
                            </span>
                        </div>
                `;

                // 사업 프로젝트별로 렌더링
                if (sprintView.businessProjects.length === 0) {
                    html += '<p style="color: #8b949e; font-size: 0.9em; margin: 10px 0;">할당된 Epic이 없습니다.</p>';
                } else {
                    sprintView.businessProjects.forEach(({ project, epics }) => {
                        const projectProgress = calculateProjectProgress(project);

                        html += `
                            <div style="background: #0d1117; border-radius: 6px; padding: 12px; margin: 10px 0; border-left: 3px solid #1f6feb;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <a href="${project.url}" target="_blank" style="color: #c9d1d9; text-decoration: none; font-weight: 600; font-size: 1.05em;">
                                        ${project.title}
                                    </a>
                                    <span style="color: #58a6ff; font-size: 0.9em;">${projectProgress}%</span>
                                </div>
                        `;

                        // Epic 목록
                        epics.forEach(epic => {
                            const progress = calculateEpicProgress(epic);
                            const stateColor = epic.state === 'OPEN' ? '#3fb950' : epic.state === 'CLOSED' ? '#8b949e' : '#d29922';

                            html += `
                                <div style="padding: 8px; background: #161b22; border-radius: 4px; margin-top: 8px; border-left: 2px solid ${stateColor};">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <a href="${epic.url}" target="_blank" style="color: #58a6ff; text-decoration: none; font-size: 0.95em;">
                                            Epic #${epic.number}: ${epic.title}
                                        </a>
                                        <span style="color: #8b949e; font-size: 0.85em;">${progress}%</span>
                                    </div>
                                    ${epic.tasks && epic.tasks.length > 0 ? `
                                        <div style="margin-top: 6px; font-size: 0.85em; color: #8b949e;">
                                            Tasks: ${epic.tasks.filter(t => t.completed).length}/${epic.tasks.length}
                                            ${epic.subIssues && epic.subIssues.length > 0 ? `• Sub-Issues: ${epic.subIssues.filter(si => si.state === 'CLOSED').length}/${epic.subIssues.length}` : ''}
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        });

                        html += '</div>';
                    });
                }

                html += '</div>';
            });

            html += '</div>';
            document.getElementById('content').innerHTML = html;
        }

        // Sprint 뷰 렌더링 (주간 Bottom-Up 방식: 이번주 Task → Epic → 사업)
        function renderSprintView(projects) {
            const weeklyData = buildWeeklySprintView(iterationsData, projects);

            if (!weeklyData.sprint) {
                document.getElementById('content').innerHTML = `
                    <div class="sprint-view">
                        <h2 style="margin-bottom: 20px; color: #58a6ff;">이번주 Sprint 업무</h2>
                        <div style="text-align: center; padding: 60px 20px; color: #8b949e;">
                            <p style="font-size: 1.2em; margin-bottom: 10px;">진행 중인 스프린트가 없습니다</p>
                            <p style="font-size: 0.9em;">스프린트가 시작되면 이번주 업무가 표시됩니다</p>
                        </div>
                    </div>
                `;
                return;
            }

            const sprint = weeklyData.sprint;
            const startDate = new Date(sprint.startDate);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + sprint.duration);

            let html = `
                <div class="sprint-view">
                    <h2 style="margin-bottom: 20px; color: #58a6ff;">🏃 이번주 Sprint 업무</h2>
                    <div style="background: #0d1721; border: 2px solid #58a6ff; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-size: 1.2em; font-weight: 600; color: #79c0ff;">${sprint.title}</span>
                                <span style="background: #1f6feb; padding: 3px 10px; border-radius: 4px; font-size: 0.85em; margin-left: 10px;">진행중</span>
                            </div>
                            <span style="font-size: 0.95em; color: #8b949e;">
                                ${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}
                                (${sprint.duration}일간)
                            </span>
                        </div>
                        <div style="margin-top: 12px; color: #8b949e; font-size: 0.9em;">
                            이번주 할당된 Epic: ${sprint.epics.length}개
                            ${weeklyData.businessProjects.length > 0 ? `• 관련 사업: ${weeklyData.businessProjects.length}개` : ''}
                        </div>
                        <details style="margin-top: 10px; font-size: 0.85em; color: #8b949e;">
                            <summary style="cursor: pointer;">디버그: 할당된 Epic 목록</summary>
                            <pre style="background: #0d1117; padding: 10px; border-radius: 4px; overflow: auto; margin-top: 8px;">${JSON.stringify(sprint.epics.map(e => ({num: e.number, title: e.title})), null, 2)}</pre>
                        </details>
                    </div>
            `;

            // 먼저 모든 이터레이션 Epic 표시 (매핑 안 된 것도 포함)
            if (sprint.epics && sprint.epics.length > 0) {
                // 매핑된 Epic 번호 수집
                const mappedEpicNumbers = new Set();
                weeklyData.businessProjects.forEach(({ weeklyEpics }) => {
                    weeklyEpics.forEach(epic => mappedEpicNumbers.add(epic.number));
                });

                // 매핑 안 된 Epic들 표시
                const unmappedEpics = sprint.epics.filter(e => !mappedEpicNumbers.has(e.number));
                if (unmappedEpics.length > 0) {
                    html += `
                        <div style="background: #161b22; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #8b949e;">
                            <h3 style="margin: 0 0 15px 0; color: #8b949e;">
                                미분류 Epic (${unmappedEpics.length}개)
                            </h3>
                            <div style="color: #8b949e; font-size: 0.9em; margin-bottom: 15px;">
                                사업 프로젝트에 연결되지 않은 Epic들입니다
                            </div>
                    `;

                    unmappedEpics.forEach(epic => {
                        const stateColor = epic.state === 'OPEN' ? '#3fb950' : epic.state === 'CLOSED' ? '#8b949e' : '#d29922';

                        html += `
                            <div class="epic-item" style="margin: 12px 0; padding: 15px; background: #0d1117; border-radius: 6px; border-left: 3px solid ${stateColor};">
                                <div style="display: flex; justify-content: space-between; align-items: start;">
                                    <div style="flex: 1;">
                                        <a href="${epic.url}" target="_blank" style="color: #58a6ff; text-decoration: none; font-weight: 600; font-size: 1.05em;">
                                            Epic #${epic.number}: ${epic.title}
                                        </a>
                                        <span style="margin-left: 8px; padding: 2px 8px; background: ${stateColor}; border-radius: 12px; font-size: 0.75em; color: #0d1117;">
                                            ${epic.state}
                                        </span>
                                    </div>
                                </div>
                                <div style="margin-top: 8px; color: #8b949e; font-size: 0.85em;">
                                    이터레이션: ${epic.iterationTitle || sprint.title}
                                </div>
                            </div>
                        `;
                    });

                    html += '</div>';
                }
            }

            // 사업 프로젝트별로 렌더링 (Bottom-Up 역산 결과)
            if (weeklyData.businessProjects.length > 0) {
                weeklyData.businessProjects.forEach(({ project, weeklyEpics }) => {
                    const projectProgress = calculateProjectProgress(project);

                    html += `
                        <div class="business-section" style="background: #161b22; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #1f6feb;">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                                <div style="flex: 1;">
                                    <h3 style="margin: 0 0 8px 0;">
                                        <a href="${project.url}" target="_blank" style="color: #c9d1d9; text-decoration: none; font-size: 1.2em;">
                                            ${project.title}
                                        </a>
                                    </h3>
                                    <div style="color: #8b949e; font-size: 0.9em;">
                                        이번주 할당: ${weeklyEpics.length}개 Epic
                                        ${project.status ? `• 상태: ${project.status}` : ''}
                                    </div>
                                </div>
                                <div style="text-align: right; min-width: 100px;">
                                    <div style="font-size: 1.4em; font-weight: 600; color: #58a6ff;">${projectProgress}%</div>
                                    <div style="font-size: 0.85em; color: #8b949e;">전체 진행률</div>
                                </div>
                            </div>
                    `;

                    // 사업 프로젝트 내 이번주 Epic들 렌더링
                    weeklyEpics.forEach(epic => {
                        const progress = calculateEpicProgress(epic);
                        const stateColor = epic.state === 'OPEN' ? '#3fb950' : epic.state === 'CLOSED' ? '#8b949e' : '#d29922';

                        html += `
                            <div class="epic-item" style="margin: 12px 0; padding: 15px; background: #0d1117; border-radius: 6px; border-left: 3px solid ${stateColor};">
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                                    <div style="flex: 1;">
                                        <a href="${epic.url}" target="_blank" style="color: #58a6ff; text-decoration: none; font-weight: 600; font-size: 1.05em;">
                                            Epic #${epic.number}: ${epic.title}
                                        </a>
                                        <span style="margin-left: 8px; padding: 2px 8px; background: ${stateColor}; border-radius: 12px; font-size: 0.75em; color: #0d1117;">
                                            ${epic.state}
                                        </span>
                                    </div>
                                    <div style="text-align: right; min-width: 70px;">
                                        <div style="font-size: 1.1em; font-weight: 600; color: #58a6ff;">${progress}%</div>
                                    </div>
                                </div>

                                ${epic.tasks && epic.tasks.length > 0 ? `
                                    <div style="margin-bottom: 10px;">
                                        <div style="color: #8b949e; font-size: 0.9em; margin-bottom: 6px;">
                                            Tasks: ${epic.tasks.filter(t => t.completed).length}/${epic.tasks.length} 완료
                                        </div>
                                        <div class="progress-bar">
                                            <div class="progress-fill" style="width: ${progress}%;"></div>
                                        </div>
                                    </div>
                                ` : ''}

                                ${epic.subIssues && epic.subIssues.length > 0 ? `
                                    <div style="color: #8b949e; font-size: 0.85em;">
                                        Sub-Issues: ${epic.subIssues.filter(si => si.state === 'CLOSED').length}/${epic.subIssues.length} 완료
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    });

                    html += '</div>';
                });
            }

            html += '</div>';
            document.getElementById('content').innerHTML = html;
        }

        // 프로젝트 진행률 계산
        function calculateProjectProgress(project) {
            if (!project.epics || project.epics.length === 0) return 0;

            let totalTasks = 0;
            let completedTasks = 0;

            project.epics.forEach(epic => {
                if (epic.tasks) {
                    totalTasks += epic.tasks.length;
                    completedTasks += epic.tasks.filter(t => t.completed).length;
                }
                if (epic.subIssues) {
                    totalTasks += epic.subIssues.length;
                    completedTasks += epic.subIssues.filter(si => si.state === 'CLOSED').length;
                }
            });

            return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        }

        // Epic 진행률 계산
        function calculateEpicProgress(epic) {
            let total = 0;
            let completed = 0;

            if (epic.tasks) {
                total += epic.tasks.length;
                completed += epic.tasks.filter(t => t.completed).length;
            }
            if (epic.subIssues) {
                total += epic.subIssues.length;
                completed += epic.subIssues.filter(si => si.state === 'CLOSED').length;
            }

            return total > 0 ? Math.round((completed / total) * 100) : 0;
        }

        // Task 체크박스 업데이트 (GitHub 이슈 수정)
        async function updateTaskCheckbox(epicNumber, taskIndex, newCheckedState) {
            if (!GITHUB_TOKEN) {
                alert('GitHub 토큰이 필요합니다.');
                return;
            }

            try {
                // 1. Epic 이슈 조회
                const issueResponse = await fetch(`https://api.github.com/repos/semicolon-devteam/command-center/issues/${epicNumber}`, {
                    headers: {
                        'Authorization': `Bearer ${GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (issueResponse.status === 401 || issueResponse.status === 403) {
                    alert('⚠️ 권한 부족\n\nGitHub 토큰에 write 권한(repo scope)이 없습니다.\n\n해결 방법:\n1. GitHub Settings → Developer settings → Personal access tokens\n2. 토큰 재생성 시 "repo" 권한 체크\n3. 대시보드에서 토큰 재설정');
                    return;
                }

                if (!issueResponse.ok) {
                    throw new Error(`Failed to fetch issue: ${issueResponse.status}`);
                }

                const issue = await issueResponse.json();
                let body = issue.body || '';

                // 2. Task list에서 해당 인덱스의 체크박스 상태 변경 (Tasks만, Sub-Issues 제외)
                const taskRegex = /- \[([ x])\] (.+?)(?:\((.+?)\))?$/gm;
                let currentIndex = 0;
                let updated = false;

                body = body.replace(taskRegex, (match, checked, title, note) => {
                    const fullText = title.trim();

                    // Sub-Issue는 건너뛰기 (#숫자 패턴)
                    const isSubIssue = /^#\d+/.test(fullText);

                    if (!isSubIssue) {
                        // Task만 카운트하고 매칭 확인
                        if (currentIndex === taskIndex) {
                            updated = true;
                            currentIndex++; // 반드시 증가시켜서 다음 항목이 매칭되지 않도록
                            const newChecked = newCheckedState ? 'x' : ' ';
                            return `- [${newChecked}] ${title}${note ? `(${note})` : ''}`;
                        }
                        currentIndex++; // 매칭 안 되어도 증가
                    }

                    return match;
                });

                if (!updated) {
                    alert('체크박스를 찾을 수 없습니다.');
                    return;
                }

                // 3. 이슈 업데이트
                const updateResponse = await fetch(`https://api.github.com/repos/semicolon-devteam/command-center/issues/${epicNumber}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ body })
                });

                if (updateResponse.status === 401 || updateResponse.status === 403) {
                    alert('⚠️ 권한 부족\n\nGitHub 토큰에 write 권한(repo scope)이 없습니다.\n\n해결 방법:\n1. GitHub Settings → Developer settings → Personal access tokens\n2. 토큰 재생성 시 "repo" 권한 체크\n3. 대시보드에서 토큰 재설정');
                    return;
                }

                if (!updateResponse.ok) {
                    throw new Error(`Failed to update issue: ${updateResponse.status}`);
                }

                // 4. 성공 - 데이터 새로고침
                console.log(`✅ Epic #${epicNumber} Task ${taskIndex} updated`);
                await loadProjects(); // 전체 새로고침

            } catch (error) {
                console.error('Task update error:', error);
                alert(`❌ 업데이트 실패\n\n${error.message}\n\n자세한 내용은 콘솔을 확인하세요.`);
            }
        }

        // 필터 이벤트
        document.getElementById('filterStatus').addEventListener('change', (e) => {
            const filter = e.target.value;
            let filtered = projectsData;

            if (filter !== 'all') {
                filtered = projectsData.filter(p => {
                    const status = p.status?.toLowerCase() || '';
                    if (filter === 'active') return status.includes('진행') || status.includes('작업');
                    if (filter === 'completed') return status.includes('완료');
                    if (filter === 'pending') return status.includes('대기') || status.includes('승인');
                    return true;
                });
            }

            renderTimeline(filtered);
        });

        // 페이지 로드 시 실행
        window.addEventListener('DOMContentLoaded', () => {
            if (GITHUB_TOKEN) {
                loadProjects();
            }
        });
