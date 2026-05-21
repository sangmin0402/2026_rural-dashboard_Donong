# Impeccable 디자인 진단 — 초기 audit

**도구**: [Impeccable](https://impeccable.style) (Apache 2.0, AI 코딩 환경용 디자인 보조 도구)  
**설치**: `npx skills add pbakaus/impeccable` → `.claude/skills/impeccable` 심볼릭 링크 + `.agents/skills/impeccable` 실제 파일  
**실행**: `npx impeccable detect css/ index.html`  
**최초 실행 결과**: **59개의 안티패턴** 발견 (5/18 피드백 #1 'UI 재검토' 기반 자료)

---

## 1. 안티패턴 카테고리 요약

| 카테고리 | 발견 수 | 심각도 | 의미 |
|---------|--------|------|------|
| **side-tab** (카드 한쪽 굵은 보더) | 8 | 🟡 | "AI 생성 UI의 가장 인식 가능한 표식" — 모든 카드에 `border-left: 3px` 류 |
| **low-contrast** | 20+ | 🔴 | WCAG AA 미달. 골든 액센트 `#d4a574` 배경에 흰 글자(2.2:1), 흰 위 흰(1.0:1) 등 |
| **layout-transition** | 7 | 🟡 | `transition: width/height` — 레이아웃 thrash 유발 |
| **repeated-section-kickers** | 4 | 🟢 | 랜딩의 작은 uppercase 라벨 ("WHY"·"REGIONS" 등) — "AI 편집 스캐폴딩" |
| **gradient-text** | 2 | 🟢 | `background-clip: text + gradient` — 의미 없는 장식 |
| **skipped-heading** | 2 | 🟡 | `h2 → h4` 스킵, 접근성 문제 (스크린리더) |
| **bounce-easing** | 1 | 🟢 | `cubic-bezier(0.34, 1.56, 0.64, 1)` — 데이트된 느낌 |

---

## 2. 우선 수정 항목 (Commit 2 polish 대상)

### 2-1. 🔴 최우선 — 저대비 (low-contrast)
WCAG AA 위반은 접근성·가독성 모두 문제. 가장 심각한 케이스:

| 위치 | 색 조합 | 비율 | 필요 | 수정 방향 |
|------|--------|------|------|---------|
| 골든 배경 흰 글자 | `#ffffff on #d4a574` | 2.2:1 | 3.0:1 | `--accent-dark`(#B5874A) 또는 텍스트를 진한 갈색(#2A1F12)으로 |
| 골든 위 옅은 골든 | `#e5c19a on #d4a574` | 1.3:1 | 4.5:1 | 라벨 색을 `--text-primary`로 변경 |
| 흰 위 흰 | `#ffffff on #ffffff` | 1.0:1 | 3.0:1 | (어디인지 식별 후 즉시 수정) |
| 옅은 회녹 위 옅은 회녹 | `#6b7770 on #f8faf6` | 4.4:1 | 4.5:1 | 거의 통과 — 텍스트 색을 `#5a665e` 정도로 |
| 흰 위 파랑 | `#ffffff on #4a90d9` | 3.3:1 | 4.5:1 | 파랑을 `#3074B8` 정도로 |

### 2-2. 🟡 side-tab 카드 보더 단순화
8군데 `border-left: 3px solid …` 사용. 다음 중 선택:
- (a) 보더 두께 1px로 + `box-shadow` 으로 강조 깊이감
- (b) `border-left` 완전 제거 + 좌측 4px `padding-left` + accent-color top-left corner
- (c) 카드 좌측에 작은 `::before` 도트 또는 아이콘 배지

### 2-3. 🟡 layout-transition → transform 으로
7개 위치 (`transition: width/height/padding/margin`)를 `transform: scaleX/scaleY` 또는 `grid-template-rows`로 전환. 성능 향상.

### 2-4. 🟢 repeated-section-kickers 정돈
랜딩의 "WHY"·"REGIONS"·"🥇 시군 랭킹"·"📚 지표 가이드" 4개 작은 라벨이 반복. 대안:
- (a) 아이콘 + 굵은 h2만 (kicker 제거)
- (b) kicker 자리에 더 구체적인 메타데이터 (예: "5개 권역" 같은 facts)

### 2-5. 🟢 skipped-heading 정리
- `h2 "경기도 농촌 5대 권역" → h4 "북부접경권"` → h3로 (또는 권역명을 h2 아래 h3)
- `h1 "-" → h3 "📊 지역 기본 통계"` → h2로

---

## 3. Polish 작업 계획 (Commit 2)

우선순위 순:

1. 🔴 **low-contrast 모두 수정** — 다회 detect 후 0개로
2. 🟡 **side-tab 보더 일관화** — 디자인 토큰으로 통합 (`.card-accent-left`)
3. 🟢 **repeated-section-kickers** 정돈 (랜딩만)
4. 🟡 **layout-transition** → transform 변환
5. 🟡 **skipped-heading** 보정
6. 🟢 **bounce-easing** → ease-out-expo
7. 🟢 **gradient-text** 단색으로

각 카테고리별로 commit 분리하면 review 쉬워짐. 그러나 같은 PR 안에서 진행.

---

## 4. detect 재실행 방법

```powershell
cd Web
npx impeccable detect css/ index.html
```

목표: 다음 detect 시 **0~5개** 미만 (low-contrast·side-tab 완전 제거, repeated-kickers는 의도 보존 가능)

향후 CI/CD에 추가 가능:
```powershell
npx impeccable detect css/ index.html --json
```

---

## 5. Live Mode 사용 가능성

impeccable의 **Live Mode**는 Vite/Next/Astro/SvelteKit/Nuxt 같은 HMR 환경에 의존.  
우리 프로젝트는 정적 HTML — Vite 마이그레이션 시 사용 가능. 이번 PR 범위 아님.

대안: `npx impeccable detect ... --json` 결과를 자동 수정 스크립트로 활용 (수동 코드 변경 + 재detect 반복).
