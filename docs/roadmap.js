        // GitHub Projects GraphQL API 설정
        const GITHUB_TOKEN = localStorage.getItem('github_token') || prompt('GitHub Personal Access Token을 입력하세요:\n(Settings → Developer settings → Personal access tokens → Generate new token)\n권한: repo, read:org, read:project');

        if (GITHUB_TOKEN) {
            localStorage.setItem('github_token', GITHUB_TOKEN);
        }

        const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

        // 데이터 저장소
        let projectsData = [];
        let epicsData = [];
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

        // 타임라인 렌더링
        function renderTimeline(projects) {
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

            let html = '<div class="timeline">';

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

            const currentWeek = weeks.findIndex(w => now >= w.start && now <= w.end);

            let html = `<div class="month-view"><h2 style="margin-bottom: 20px; color: #58a6ff;">${year}년 ${month + 1}월 - 주간 활동 현황</h2>`;

            weeks.forEach((week, weekIndex) => {
                const isCurrent = weekIndex === currentWeek;

                // 해당 주에 업데이트된 Epic 찾기
                const weekActivities = [];
                projects.forEach(p => {
                    if (!p.epics) return;

                    p.epics.forEach(epic => {
                        if (!epic.updatedAt) return;

                        const epicDate = new Date(epic.updatedAt);
                        if (epicDate >= week.start && epicDate <= week.end) {
                            weekActivities.push({
                                project: p,
                                epic: epic,
                                updatedAt: epic.updatedAt
                            });
                        }
                    });
                });

                if (weekActivities.length === 0 && !isCurrent) return;

                const weekClass = isCurrent ? 'week-section current-week' : 'week-section';
                html += `
                    <div class="${weekClass}">
                        <div class="week-header">
                            <span>Week ${weekIndex + 1} (${week.start.getMonth() + 1}/${week.start.getDate()} - ${week.end.getMonth() + 1}/${week.end.getDate()})
                                ${isCurrent ? '<span style="background: #1f6feb; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; margin-left: 10px;">이번 주</span>' : ''}
                            </span>
                            <span style="font-size: 0.8em; color: #8b949e;">활동 ${weekActivities.length}건</span>
                        </div>
                `;

                if (weekActivities.length > 0) {
                    weekActivities.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

                    weekActivities.forEach(activity => {
                        const progress = calculateEpicProgress(activity.epic);
                        const updateDate = new Date(activity.updatedAt);

                        html += `
                            <div class="activity-item">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <a href="${activity.project.url}" target="_blank" style="color: #c9d1d9; text-decoration: none; font-weight: 600;">
                                            ${activity.project.title}
                                        </a>
                                        <span style="color: #8b949e; margin: 0 8px;">›</span>
                                        <a href="${activity.epic.url}" target="_blank" style="color: #58a6ff; text-decoration: none;">
                                            Epic #${activity.epic.number}: ${activity.epic.title}
                                        </a>
                                    </div>
                                    <span class="activity-time">${updateDate.getMonth() + 1}/${updateDate.getDate()} ${updateDate.getHours()}:${String(updateDate.getMinutes()).padStart(2, '0')}</span>
                                </div>
                                <div style="margin-top: 8px; font-size: 0.9em; color: #8b949e;">
                                    진행률: ${progress}%
                                    ${activity.epic.tasks && activity.epic.tasks.length > 0 ? `• ${activity.epic.tasks.filter(t => t.completed).length}/${activity.epic.tasks.length} Tasks` : ''}
                                    ${activity.epic.subIssues && activity.epic.subIssues.length > 0 ? `• ${activity.epic.subIssues.filter(si => si.state === 'CLOSED').length}/${activity.epic.subIssues.length} Sub-Issues` : ''}
                                </div>
                            </div>
                        `;
                    });
                } else {
                    html += '<p style="color: #8b949e; font-size: 0.9em; margin: 10px 0;">활동 내역이 없습니다.</p>';
                }

                html += '</div>';
            });

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
    </script>
