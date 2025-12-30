# SEMO 프로젝트 대시보드

## 개요

GitHub Projects API를 활용한 프로젝트 로드맵 시각화 대시보드입니다.

## 기능

- ✅ 사업 프로젝트 → Epic → Task 계층 구조 표시
- ✅ 타임라인 뷰 (월별)
- ✅ 진행률 자동 계산
- ✅ 실시간 데이터 로드
- ✅ 필터 및 그룹핑
- ✅ 반응형 디자인

## 접속 방법

### GitHub Pages (배포 후)
```
https://semicolon-devteam.github.io/team-selecolon/roadmap.html
```

### 로컬 테스트
```bash
# 1. 파일 열기
open docs/roadmap.html

# 2. 또는 간단한 HTTP 서버
cd docs
python -m http.server 8000
# http://localhost:8000/roadmap.html 접속
```

## 설정

### 1. GitHub Personal Access Token 발급

1. GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. 권한 선택:
   - ✅ `repo`
   - ✅ `read:org`
   - ✅ `read:project`
4. Generate token
5. 토큰 복사 (한 번만 표시됨!)

### 2. 토큰 입력

대시보드 첫 접속 시 토큰 입력 창이 나타납니다.
토큰은 브라우저 localStorage에 저장되어 재사용됩니다.

**토큰 재설정**: 대시보드 하단 "토큰 재설정" 버튼 클릭

## 데이터 소스

- **사업관리 프로젝트**: https://github.com/orgs/semicolon-devteam/projects/6
- **이슈관리 프로젝트**: https://github.com/orgs/semicolon-devteam/projects/1

## 문제 해결

### "GitHub API Error: 401" 오류
→ Personal Access Token이 유효하지 않거나 권한이 부족합니다.
→ 토큰을 재발급하고 올바른 권한을 선택했는지 확인하세요.

### "GitHub API Error: 404" 오류
→ 프로젝트 번호가 잘못되었거나 접근 권한이 없습니다.
→ 조직 멤버인지 확인하세요.

### 데이터가 표시되지 않음
→ Issue 본문에 Task list (체크박스)가 있는지 확인하세요.
→ 예시:
```markdown
## 하위 작업
- [x] 완료된 작업
- [ ] 미완료 작업
```

## 업데이트 내역

- **2025-12-30**: 초기 버전 배포
  - 타임라인 뷰
  - 계층 구조 표시
  - Task list 파싱
  - 진행률 계산

## 기술 스택

- Vanilla JavaScript (프레임워크 없음)
- GitHub GraphQL API
- GitHub Pages

## 라이선스

MIT License
