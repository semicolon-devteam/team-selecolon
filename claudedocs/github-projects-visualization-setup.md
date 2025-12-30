# GitHub Projects 시각화 설정 가이드

> 목적: 사업관리(#6)와 이슈관리(#1) 프로젝트를 한눈에 시각화

---

## 🎯 최종 목표

```
사업관리 프로젝트 (#6)          이슈관리 프로젝트 (#1)
┌─────────────────┐           ┌─────────────────┐
│ 정치판          │ ────────▶ │ Epic #71-75     │
│ 목표: 2025-12-21│           │ (DEBATE, MEMBER)│
│ 예산: -         │           │                 │
└─────────────────┘           └─────────────────┘
```

---

## 📊 방법 1: Roadmap View (타임라인) - 추천!

### 생성 단계

#### 1. 사업관리 프로젝트 Roadmap View 생성

```bash
# 웹 UI에서 진행 (CLI 미지원)
1. https://github.com/orgs/semicolon-devteam/projects/6 접속
2. 우측 상단 "+ New view" 클릭
3. View name: "📅 로드맵 타임라인"
4. Layout: "Roadmap" 선택
5. 저장
```

#### 2. Roadmap 설정

```yaml
Date field: "목표일"
Group by: "상태"  # 또는 "카테고리"
Zoom level: "Month"
Show: "All items"
Sort: "목표일 (ascending)"
```

#### 3. Filter 추가 (선택사항)

**진행중인 프로젝트만 보기**:
```
status:진행중 OR status:승인대기
```

**예산 있는 프로젝트만 보기**:
```
예산:>0
```

**2025년 프로젝트만 보기**:
```
목표일:>=2025-01-01 AND 목표일:<=2025-12-31
```

### 결과 화면

웹 브라우저에서 다음과 같이 표시됩니다:

```
┌─────────────────────────────────────────────────────────────┐
│  📅 로드맵 타임라인                                          │
├─────────────────────────────────────────────────────────────┤
│  Oct 2025        Nov 2025        Dec 2025        Jan 2026   │
│  ├─────────────┼─────────────┼─────────────┼─────────────┤ │
│  │             │ ████████    │             │             │ │
│  │             │ 노조관리     │ ████ 시연   │             │ │
│  │             │             │             │             │ │
│  │             │ ████████████│█████        │             │ │
│  │             │ 정치판       │ ● 오픈      │             │ │
│  │             │             │             │             │ │
│  │             │             │ ●           │             │ │
│  │             │             │ 에스테틱     │             │ │
│  │             │             │             │             │ │
│  │             │             │ ●           │             │ │
│  │             │             │ 매출관리     │             │ │
└─────────────────────────────────────────────────────────────┘
```

**URL**: `https://github.com/orgs/semicolon-devteam/projects/6/views/<VIEW_ID>`

---

## 🔗 방법 2: Epic 연결 필드 추가

### Step 1: "관련 Epic" 필드 생성

#### GitHub CLI 사용
```bash
# 사업관리 프로젝트에 TEXT 필드 추가
gh api graphql -f query='
mutation {
  addProjectV2Field(input: {
    projectId: "PVT_kwDOC01-Rc4BBDWg"
    dataType: TEXT
    name: "관련 Epic"
  }) {
    projectV2Field {
      ... on ProjectV2Field {
        id
        name
      }
    }
  }
}'
```

#### 또는 웹 UI 사용
```
1. 프로젝트 Settings (⚙️) → Fields
2. "+ New field" 클릭
3. Field name: "관련 Epic"
4. Field type: "Text"
5. 저장
```

### Step 2: Epic 번호 입력

각 사업 이슈에 관련 Epic 번호 입력:

| 사업 이슈 | 관련 Epic 필드 값 |
|---------|----------------|
| 정치판 (#34) | `#71, #72, #73, #74, #75` |
| 코인톡 (#33) | `#91, #92, #93, #94, #95, #96` |
| 랜드 (#32) | `#78, #79, #80, #81, #82, #83, #84, #85, #87, #88, #89, #90` |
| 오피스 (#185) | `#62, #63, #64, #65, #66, #67, #127, #128` |
| 노조관리 (#139) | `core-backend#31, core-backend#32` |

### Step 3: Table View에서 확인

```bash
# 새 Table View 생성
1. "+ New view" → "Table"
2. View name: "🔗 Epic 연결 현황"
3. Columns 순서:
   - Title
   - 상태
   - 목표일
   - 관련 Epic  ← 새로 추가한 필드
   - 카테고리
   - 예산
```

**결과**:
```
┌───────────────┬──────┬──────────┬──────────────────┬──────────┬────────┐
│ Title         │ 상태  │ 목표일    │ 관련 Epic        │ 카테고리  │ 예산   │
├───────────────┼──────┼──────────┼──────────────────┼──────────┼────────┤
│ 정치판        │ 진행중│2025-12-21│#71,#72,#73,#74,#75│ 프로젝트 │ -      │
│ 노조관리 시스템│ 진행중│2025-11-30│core-backend#31,#32│ 프로젝트 │ ₩400만 │
│ 코인톡        │ 진행중│2025-09-21│#91-#96           │ 프로젝트 │ ₩50만  │
└───────────────┴──────┴──────────┴──────────────────┴──────────┴────────┘
```

---

## 📈 방법 3: GitHub Projects Insights (베타)

### 활성화 방법

```
1. 프로젝트 페이지 상단 "Insights" 탭 클릭
2. "+ New chart" 클릭
3. Chart type 선택:
   - Bar chart (막대 그래프)
   - Column chart (세로 막대)
   - Line chart (선 그래프)
   - Stacked area (누적 영역)
```

### 추천 차트

#### Chart 1: 카테고리별 프로젝트 수
```yaml
Chart type: Bar chart
X-axis: 카테고리
Y-axis: Count of items
Group by: 상태
Title: "카테고리별 프로젝트 현황"
```

#### Chart 2: 월별 목표일 분포
```yaml
Chart type: Column chart
X-axis: 목표일 (by month)
Y-axis: Count of items
Group by: 상태
Title: "월별 마일스톤 분포"
```

#### Chart 3: 예산 사용 현황
```yaml
Chart type: Stacked area
X-axis: 목표일
Y-axis: Sum of 예산
Group by: 카테고리
Title: "예산 사용 타임라인"
```

**결과 URL**: `https://github.com/orgs/semicolon-devteam/projects/6/insights`

---

## 🎨 방법 4: Board View with Custom Grouping

### 프로젝트 단계별 칸반

```bash
# 새 Board View 생성
1. "+ New view" → "Board"
2. View name: "📊 프로젝트 단계별"
3. Group by: "상태"
4. 저장
```

**결과**:
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 📝 계획     │ ⏳ 승인대기 │ 🚀 진행중    │ ✅ 완료     │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ 중소기업    │ 주소모음MVP │ 정치판       │ IR 자료     │
│ 규제체커    │             │ 노조관리     │ 인프라 최적화│
│ AI브리프    │             │ 코인톡       │ 명함작업    │
│ 콘텐츠자동화│             │ 랜드         │ 사업자등록  │
│             │             │ 오피스       │             │
│             │             │ 에스테틱     │             │
│             │             │ 매출관리     │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### 예산 규모별 칸반

```bash
# 새 Board View 생성
1. "+ New view" → "Board"
2. View name: "💰 예산 규모별"
3. Group by: "카테고리"
4. Sort by: "예산 (descending)"
```

---

## 🔗 방법 5: 이슈관리 프로젝트에 "사업 프로젝트" 필드 추가

### Step 1: Single Select 필드 생성

```bash
# GraphQL API 사용
gh api graphql -f query='
mutation {
  addProjectV2Field(input: {
    projectId: "PVT_kwDOC01-Rc4AtDz2"
    dataType: SINGLE_SELECT
    name: "사업 프로젝트"
    singleSelectOptions: [
      {name: "정치판", color: PURPLE}
      {name: "코인톡", color: ORANGE}
      {name: "랜드", color: RED}
      {name: "오피스", color: BLUE}
      {name: "노조관리", color: GREEN}
      {name: "세미콜론", color: CYAN}
      {name: "공통", color: GRAY}
    ]
  }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
        options {
          id
          name
        }
      }
    }
  }
}'
```

### Step 2: Epic에 사업 프로젝트 태깅

| Epic | 사업 프로젝트 |
|------|------------|
| #71-75 | 정치판 |
| #91-96 | 코인톡 |
| #78-90 | 랜드 |
| #62-67, #127-128 | 오피스 |
| #150 | 공통 |

### Step 3: Board View로 시각화

```bash
# 이슈관리 프로젝트에서
1. "+ New view" → "Board"
2. View name: "📊 사업별 Epic 현황"
3. Group by: "사업 프로젝트"
4. Filter: "is:epic" (Epic만 표시)
```

**결과**:
```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ 정치판    │ 코인톡    │ 랜드      │ 오피스    │ 공통     │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ #71 MVP  │ #91 테스트│ #78 대댓글│ #62 기업정보│ #150 마이그│
│ #72 DEBATE│ #93 모의투자│ #79 네비게이션│ #63 후기시스템│ #99 패키지│
│ #73 REALTIME│ #94 타점신호│ #80 탈퇴│ #64 REVIEW│ #100 검색│
│ #74 MEMBER│ #95 리딩방│ #81 미디어│ #65 COMMENT│ #129 DDD│
│ #75 COMMENT│ #96 마이그│ #82 갤러리│ #66 TAXONOMY│          │
│          │ #92 뉴스  │ #83 차단  │ #67 ADMIN │          │
│          │          │ ...      │ #127 AUTH│          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

---

## 🎯 추천 View 구성

### 사업관리 프로젝트 (#6) 추천 Views

| View 이름 | 타입 | Group by | Filter | 용도 |
|----------|------|----------|--------|------|
| 📅 로드맵 타임라인 | Roadmap | 상태 | - | 전체 일정 한눈에 |
| 🔗 Epic 연결 현황 | Table | - | - | Epic 번호 확인 |
| 💰 예산 현황 | Table | 카테고리 | 예산:>0 | 예산 관리 |
| 📊 진행 상황 | Board | 상태 | - | 칸반 보드 |
| 🎯 이번 달 목표 | Table | - | 목표일:2025-12 | 12월 마감 프로젝트 |

### 이슈관리 프로젝트 (#1) 추천 Views

| View 이름 | 타입 | Group by | Filter | 용도 |
|----------|------|----------|--------|------|
| 📊 사업별 Epic | Board | 사업 프로젝트 | is:epic | 사업 연결 시각화 |
| 🔥 진행중 Epic | Table | - | status:작업중 | 현재 작업 |
| ✅ 완료 Epic | Table | - | status:CLOSED | 완료 기록 |
| 🎨 기술영역별 | Board | 기술영역 | - | 백엔드/프론트 분리 |

---

## 📱 모바일에서 보기

GitHub Projects는 모바일 앱에서도 사용 가능합니다:

```
1. GitHub Mobile 앱 설치
2. semicolon-devteam 조직 접속
3. Projects 탭 → 사업관리 or 이슈관리
4. 모든 View 접근 가능
```

---

## 🚀 자동화: Epic과 사업 이슈 자동 연결

### GitHub Actions 워크플로우

파일: `.github/workflows/link-epic-to-business.yml`

```yaml
name: Link Epic to Business Issue

on:
  issues:
    types: [labeled, opened]

jobs:
  link-epic:
    runs-on: ubuntu-latest
    steps:
      - name: Check if Epic
        id: check_epic
        run: |
          if [[ "${{ github.event.issue.title }}" == *"[Epic]"* ]]; then
            echo "is_epic=true" >> $GITHUB_OUTPUT
          fi

      - name: Add to 이슈관리 project
        if: steps.check_epic.outputs.is_epic == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh project item-add 1 \
            --owner semicolon-devteam \
            --url https://github.com/${{ github.repository }}/issues/${{ github.event.issue.number }}

      - name: Set 사업 프로젝트 field
        if: steps.check_epic.outputs.is_epic == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # 라벨 기반 자동 태깅
          if [[ "${{ contains(github.event.issue.labels.*.name, '정치판') }}" == "true" ]]; then
            BUSINESS_PROJECT="정치판"
          elif [[ "${{ contains(github.event.issue.labels.*.name, '코인톡') }}" == "true" ]]; then
            BUSINESS_PROJECT="코인톡"
          # ... (다른 프로젝트)
          fi

          # 필드 업데이트 (GraphQL API 사용)
          gh api graphql -f query="..."
```

---

## 🎨 최종 결과

위 설정을 모두 완료하면:

### 사업관리 프로젝트에서
1. **Roadmap View**: 월별 타임라인으로 전체 일정 파악
2. **Table View**: Epic 번호 클릭 → 이슈관리 프로젝트로 바로 이동
3. **Board View**: 상태별/카테고리별 칸반 보드

### 이슈관리 프로젝트에서
1. **Board View (사업별)**: 각 사업 프로젝트의 Epic 그룹핑
2. **Filter**: 특정 사업 프로젝트 Epic만 보기
3. **Table View**: Epic → 사업 이슈 역참조

### 양방향 연결
```
사업관리 #34 (정치판)
  ↓ "관련 Epic" 필드
이슈관리 #71 (정치판 MVP Epic)
  ↓ "사업 프로젝트" 필드
사업관리 #34 (정치판)
```

---

## 📊 실제 활용 예시

### 주간 미팅 준비
```
1. Roadmap View 열기
2. 이번 주 마감 프로젝트 확인
3. 관련 Epic 클릭하여 진행 상황 파악
4. 스크린샷 찍어 리포트 작성
```

### 우선순위 조정
```
1. Table View에서 "중요도" 기준 정렬
2. 목표일이 가까운 프로젝트 확인
3. 관련 Epic의 작업량 확인
4. 리소스 재배치 결정
```

### 예산 트래킹
```
1. Table View에서 "예산" 컬럼 합계 확인
2. Filter: "예산:>100만" (100만원 이상 프로젝트만)
3. 월별 지출 추이 파악
```

---

*최종 업데이트: 2025-12-30*
