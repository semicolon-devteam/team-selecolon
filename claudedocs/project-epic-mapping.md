# 사업관리 ↔ 이슈관리 Epic 연관 관계 분석

> 생성일: 2025-12-30
> 목적: 사업관리 프로젝트(#6)의 사업 이슈와 이슈관리 프로젝트(#1)의 기술 Epic 간 연결 구조 정립

---

## 🎯 연관 관계 개요

사업관리 프로젝트는 **비즈니스 레벨**의 사업/프로젝트를 관리하고,
이슈관리 프로젝트는 **기술 레벨**의 Epic과 Task를 관리합니다.

현재는 두 프로젝트가 **암묵적 연결**만 되어 있어, 명시적인 연결 구조가 필요합니다.

---

## 📊 현재 매핑 상태

### ✅ 명확히 연결된 사례

| 사업관리 이슈 | 이슈관리 Epic | 연결 방법 | 상태 |
|-------------|-------------|----------|------|
| **정치판** (#34) | [Epic] 정치판 MVP (#71-75) | 프로젝트명 일치 | 🚀 진행중 |
| **코인톡** (#33) | [Epic] 코인톡 관련 Epic (#91-96) | 프로젝트명 일치 | 🚀 진행중 |
| **랜드** (#32) | [Epic] 랜드 관련 Epic (#78-90) | 프로젝트명 일치 | 🚀 진행중 |
| **오피스** (#185) | [Epic] 오피스 관련 Epic (#62-67) | 프로젝트명 일치 | 🚀 진행중 |
| **노조관리 시스템** (#139) | (별도 레포: core-backend) | 독립 프로젝트 | 🚀 진행중 |

### ⚠️ 연결 불명확한 사례

| 사업관리 이슈 | 이슈관리에서 해당 Epic | 문제점 |
|-------------|---------------------|-------|
| **주소모음 MVP** (#184) | 해당 Epic 없음 | Epic 미생성 |
| **에스테틱 MVP** (#182) | 해당 Epic 없음 | Epic 미생성 |
| **매출관리 MVP** (#183) | 해당 Epic 없음 | Epic 미생성 |
| **워크 서포트 AI** (#28) | 해당 Epic 없음 | 아이디어 단계 |

---

## 🔗 권장 연결 구조

### 1단계: GitHub Issue Link 활용

사업관리 이슈에 이슈관리 Epic을 명시적으로 링크:

```markdown
## 관련 Epic
- [Epic] 정치판 MVP: semicolon-devteam/command-center#71
- [Epic] DEBATE 도메인: semicolon-devteam/command-center#72
- [Epic] REALTIME 도메인: semicolon-devteam/command-center#73
```

### 2단계: Custom Field 활용 (추천)

**사업관리 프로젝트(#6)에 새 필드 추가**:
- 필드명: `관련 Epic`
- 타입: `Text` 또는 `Single Select`
- 값: Epic 번호 (예: `#71, #72, #73`)

**이슈관리 프로젝트(#1)에 새 필드 추가**:
- 필드명: `사업 프로젝트`
- 타입: `Single Select`
- 값: `정치판`, `코인톡`, `랜드`, `오피스`, `노조관리`, `주소모음`, `에스테틱`, `매출관리`

### 3단계: Label 통일

공통 Label을 양쪽 프로젝트에 적용:
- `정치판` (color: #5319e7)
- `코인톡` (color: #f79412)
- `랜드` (color: #f37021)
- `오피스` (color: #0D6EFD)
- `세미콜론` (color: #068FFF)
- `템플릿` (color: #ffffff)
- `공통` (color: #ffffff)

---

## 📋 상세 매핑 테이블

### 정치판 프로젝트

| 사업관리 이슈 | 이슈관리 Epic | 레포 | 상태 |
|-------------|-------------|------|------|
| 정치판 (#34) | [Epic] 정치판 MVP (#71) | command-center | 진행중 |
| ↳ | [Epic] DEBATE · 토론 (#72) | command-center | CLOSED |
| ↳ | [Epic] REALTIME · 실시간 여론 그래프 (#73) | command-center | CLOSED |
| ↳ | [Epic] MEMBER · 회원 (#74) | command-center | CLOSED |
| ↳ | [Epic] COMMENT · 댓글 (#75) | command-center | CLOSED |
| ↳ | [Design] 차트 기본 컴포넌트 (#50) | cm-jungchipan | 테스트중 |
| ↳ | [Design] 차트 Variants (#52) | cm-jungchipan | 작업중 |
| ↳ | [Design] 레이아웃 컴포넌트 (#49) | cm-jungchipan | 병합됨 |

### 코인톡 프로젝트

| 사업관리 이슈 | 이슈관리 Epic | 레포 | 상태 |
|-------------|-------------|------|------|
| 코인톡 (#33) | [Epic] 모의투자 기능 (#93) | command-center | CLOSED |
| ↳ | [Epic] 타점 신호 (#94) | command-center | CLOSED |
| ↳ | [Epic] 리딩방 채팅 (#95) | command-center | CLOSED |
| ↳ | [Epic] Community-Core 패키지 마이그레이션 (#96) | command-center | CLOSED |
| ↳ | [Epic] 뉴스 (#92) | command-center | CLOSED |

### 랜드 프로젝트

| 사업관리 이슈 | 이슈관리 Epic | 레포 | 상태 |
|-------------|-------------|------|------|
| 랜드 (#32) | [Epic] 대댓글 기능 (#78) | command-center | CLOSED |
| ↳ | [Epic] 네비게이션 성능 최적화 (#79) | command-center | CLOSED |
| ↳ | [Epic] 회원 자가 탈퇴 (#80) | command-center | CLOSED |
| ↳ | [Epic] 미디어 프로세스 오류 (#81) | command-center | CLOSED |
| ↳ | [Epic] 메인페이지 갤러리 링크 수정 (#82) | command-center | CLOSED |
| ↳ | [Epic] 사용자 차단 (#83) | command-center | CLOSED |
| ↳ | [Epic] 백업/복구 (#84) | command-center | CLOSED |
| ↳ | [Epic] 닉네임 변경 (#85) | command-center | CLOSED |
| ↳ | [Epic] 게시판 자동 이동 (#87) | command-center | CLOSED |
| ↳ | [Epic] 게시글 카테고리 (#88) | command-center | CLOSED |
| ↳ | [Epic] 랭킹 (#89) | command-center | CLOSED |
| ↳ | [Epic] 1:1 채팅 기능 (#90) | command-center | CLOSED |
| ↳ | [Epic] 랭킹 (포인트/글/댓글) (#70) | command-center | CLOSED |

### 오피스 프로젝트

| 사업관리 이슈 | 이슈관리 Epic | 레포 | 상태 |
|-------------|-------------|------|------|
| 오피스 (#185) | [Epic] COMPANY · 기업정보 관리 (#62) | command-center | CLOSED |
| ↳ | [Epic] 기업정보 팝업 및 후기/댓글 시스템 (#63) | command-center | CLOSED |
| ↳ | [Epic] REVIEW · 후기 관리 (#64) | command-center | CLOSED |
| ↳ | [Epic] COMMENT · 댓글 관리 (#65) | command-center | CLOSED |
| ↳ | [Epic] TAXONOMY · 지역/카테고리 사전 관리 (#66) | command-center | CLOSED |
| ↳ | [Epic] ADMIN · 어드민 검수/설정 관리 (#67) | command-center | CLOSED |
| ↳ | [Epic] AUTH · 회원 인증 및 타입 관리 (#127) | command-center | CLOSED |
| ↳ | [Epic] BOARD · 일반 게시판 관리 (#128) | command-center | CLOSED |

### 공통 인프라/패키지

| 사업관리 이슈 | 이슈관리 Epic | 레포 | 상태 |
|-------------|-------------|------|------|
| 인프라 비용 최적화 (#14) | [Epic] Supabase → Spring Boot 마이그레이션 (#150) | core-backend | 작업중 |
| ↳ | [Backend] Post 도메인 마이그레이션 (#32) | core-backend | 테스트중 |
| ↳ | [Backend] Comments 도메인 구현 (#48) | core-backend | 테스트중 |
| ↳ | [API] 유저 가입 API 구현 (#31) | core-backend | 테스트중 |
| - | [Epic] Core Community Package 인프라 구축 (#99) | command-center | CLOSED |
| - | [Epic] 검색 및 통합검색 기능 개선 (#100) | command-center | CLOSED |
| - | [Epic] DDD 기반 도메인 중심 아키텍처 개편 (#129) | command-center | CLOSED |

---

## 🛠️ 연결 구조 구현 방법

### Option A: GitHub Projects Field 활용 (추천)

#### 1. 사업관리 프로젝트(#6)에 필드 추가

```bash
gh project field-create 6 --owner semicolon-devteam \
  --name "관련 Epic" \
  --data-type TEXT
```

#### 2. 이슈관리 프로젝트(#1)에 필드 추가

```bash
gh project field-create 1 --owner semicolon-devteam \
  --name "사업 프로젝트" \
  --data-type SINGLE_SELECT \
  --single-select-options "정치판,코인톡,랜드,오피스,노조관리,주소모음,에스테틱,매출관리,워크서포트,공통"
```

#### 3. 기존 이슈에 필드 값 설정

```bash
# 예: 정치판 Epic들에 "사업 프로젝트: 정치판" 설정
gh project item-edit --project 1 --owner semicolon-devteam \
  --id <EPIC_ID> \
  --field-id <FIELD_ID> \
  --text "정치판"
```

### Option B: Issue Body Template 활용

모든 사업관리 이슈에 다음 섹션 추가:

```markdown
## 🔗 관련 기술 Epic
- [ ] Epic 생성 필요
- [ ] Epic 링크: semicolon-devteam/command-center#XX
- [ ] 하위 Task 생성 완료
```

모든 이슈관리 Epic에 다음 섹션 추가:

```markdown
## 📊 연결된 사업 프로젝트
- 사업관리 이슈: semicolon-devteam/command-center#XX (사업관리 프로젝트)
- 예산: ₩XX만
- 목표일: YYYY-MM-DD
```

### Option C: Automation 활용

GitHub Actions로 자동 연결:

```yaml
name: Link Business to Epic

on:
  issues:
    types: [labeled]

jobs:
  link:
    runs-on: ubuntu-latest
    steps:
      - name: Add Epic link to business issue
        if: contains(github.event.issue.labels.*.name, '정치판')
        run: |
          gh issue comment ${{ github.event.issue.number }} \
            --body "🔗 관련 Epic: #71, #72, #73, #74, #75"
```

---

## 📈 기대 효과

### 1. 투명성 향상
- 사업 담당자가 기술 진행 상황 실시간 파악
- 개발자가 사업 맥락 이해 후 개발 가능

### 2. 의사결정 속도 개선
- 사업 우선순위 변경 시 관련 Epic 즉시 식별
- Epic 완료 시 사업 마일스톤 자동 추적 가능

### 3. 리소스 최적화
- 중복 작업 방지 (같은 기능을 여러 프로젝트에서 개발)
- 공통 인프라 우선순위 조정 용이

### 4. 보고 자동화
- 프로젝트 상태 리포트 자동 생성
- 예산 대비 진행률 추적 가능

---

## 🚀 다음 단계

### Immediate (1주 내)
1. [ ] 사업관리 프로젝트에 "관련 Epic" 필드 추가
2. [ ] 이슈관리 프로젝트에 "사업 프로젝트" 필드 추가
3. [ ] 기존 Epic들에 사업 프로젝트 라벨 일괄 적용

### Short-term (2-4주)
4. [ ] 주소모음/에스테틱/매출관리 MVP Epic 생성
5. [ ] 사업관리 이슈 본문에 Epic 링크 추가
6. [ ] Epic 템플릿에 "연결된 사업 프로젝트" 섹션 추가

### Long-term (1-3개월)
7. [ ] GitHub Actions로 자동 연결 워크플로우 구축
8. [ ] 대시보드 View 생성 (사업 프로젝트별 Epic 그룹핑)
9. [ ] 월간 리포트 자동 생성 스크립트 작성

---

*최종 업데이트: 2025-12-30*
