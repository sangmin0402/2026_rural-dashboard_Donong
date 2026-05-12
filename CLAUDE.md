# 경기도 농촌다움 지표 웹 대시보드 — Claude 컨텍스트

> 새 세션을 시작하면 이 파일을 먼저 읽어 프로젝트 전체 맥락을 파악하세요.

---

## 1. 프로젝트 개요

**무엇인가?**  
경기도 15개 농촌 시군의 "농촌다움" 지표(삶터·일터·쉼터)를 비교·분석하는 인터랙티브 웹 대시보드.

**법적 배경**  
농촌공간 재구조화 및 재생지원에 관한 법률(2023) 시행에 따른 경기도 15개 농촌 시군 기본계획 수립 지원.

**대상 사용자**  
정책 실무자, 교수, 수업 팀원 (지역활성화시스템론 수업 프로젝트)

**GitHub Pages URL**  
`https://sangmin0402.github.io/2026_rural-dashboard_Donong/`

---

## 2. 파일 구조

```
Web/
├── index.html          # 단일 페이지 앱 (랜딩 + 대시보드)
├── CLAUDE.md           # ← 이 파일
├── css/
│   └── style.css       # 전체 스타일 (~3700줄)
├── js/
│   └── app.js          # 전체 앱 로직 (~2050줄, 프레임워크 없음)
└── dat/
    ├── gyeonggi-sigun.geojson   # 15개 시군 폴리곤 (중요: 인코딩 주의)
    └── gyeonggi-dong.geojson    # 읍면동 폴리곤 (줌인 시 표시)
```

---

## 3. 기술 스택

| 기술 | 버전 | 용도 |
|------|------|------|
| Leaflet.js | 1.9.4 | GeoJSON 코로플레스 지도 |
| Chart.js | 4.4.0 | 레이더 차트, 막대 차트, 시나리오 차트 |
| Vanilla JS | ES6+ | 프레임워크 없음, 단일 app.js |
| Google Fonts | — | Noto Serif KR (헤드라인) + Noto Sans KR (본문) |

---

## 4. 지표 체계 (app.js INDICATORS / NAMYANGJU_INDICATORS)

### 공통지표 11개

| 키 | 이름 | 카테고리 |
|----|------|----------|
| L1 | 인구증가율 | samlter (삶터) |
| L2 | 노령화지수 | samlter |
| L3 | 인구순이동률 | samlter |
| L4 | 생활SOC 충족지수 | samlter |
| W1 | 고용률 | ilter (일터) |
| W2 | 사업체수 | ilter |
| W3 | 재정자립도 | ilter |
| W4 | GRDP | ilter |
| R1 | 농촌환경 보전율 | shimter (쉼터) |
| R2 | 토지이용 다양성 지수 | shimter |
| R3 | 녹지율 | shimter |

### 남양주 자율지표 8개 (NAMYANGJU_INDICATORS)
L5(귀촌인 증감률), L6(3년 귀촌 규모 유지율), W5(농업 세대교체), W6(청년 귀농 유입), W7(친환경 인증 농가), R4(체험 프로그램), R5(양호수질 하천), R6(수변·생태쉼터)

### 카테고리 종합 가상 지표 (CATEGORY_TOTALS)
```javascript
const CATEGORY_TOTALS = {
  samlter_total: { category: 'samlter', label: '삶터 종합' },
  ilter_total:   { category: 'ilter',   label: '일터 종합' },
  shimter_total: { category: 'shimter', label: '쉼터 종합' },
};
```
실제 데이터 키가 아닌 가상 키 — `calcCategoryScore()`로 계산. `getCityColor()`, `buildTooltipContent()`, `buildLegendHTML()` 모두 이 키를 처리함.

---

## 5. 15개 시군 (CITIES 객체)

```
namyangju(남양주시), gapyeong(가평군), yangpyeong(양평군), yeoju(여주시),
icheon(이천시), anseong(안성시), pyeongtaek(평택시), hwaseong(화성시),
osan(오산시), yongin(용인시), gwangju(광주시), hanam(하남시),
yangju(양주시), pocheon(포천시), dongducheon(동두천시)
```

**CITIES 객체 구조:**
```javascript
CITIES[cityId] = {
  id, name, lat, lng, type, description,
  indicators: { L1, L2, ... R3 },
  namyangjuIndicators: { ... }  // namyangju만 존재
}
```

---

## 6. 핵심 함수 목록 (app.js)

| 함수 | 역할 |
|------|------|
| `initMap()` | Leaflet 지도 초기화, GeoJSON 레이어 |
| `initCharts()` | Chart.js 레이더/막대 초기화 |
| `initLandingScreen()` | 랜딩 카드 라우팅 (map/compare/scenario/namyangju) |
| `initLandingKpiCounters()` | data-target 숫자 count-up 애니메이션 |
| `initLandingMinimap()` | GeoJSON → SVG 미니맵 (400×300, 수동 프로젝션) |
| `showLandingToast()` | "준비 중" 자동 소멸 토스트 |
| `handleLandingAction(action)` | 랜딩 → 대시보드 라우팅 |
| `showRankingPage()` / `renderRankingPage(cat)` | 랭킹 오버레이 표시·렌더 |
| `showGuidePage()` / `renderGuidePage()` | 지표 가이드 오버레이 표시·렌더 |
| `showOverlayScreen(elId, hash)` / `hideAllOverlayScreens()` | 풀스크린 오버레이 공통 |
| `initOverlayScreens()` | 닫기·탭·ESC 인터랙션 초기화 |
| `calcCategoryScore(cityId, cat)` | 카테고리 종합 점수 계산 |
| `getCityColor(cityId, indicatorKey)` | 지도 코로플레스 색상 (CATEGORY_TOTALS 포함) |
| `getClassBreaks(values)` | 5분위 quantile 계산 |
| `buildTooltipContent(cityId)` | 지도 툴팁 HTML |
| `buildLegendHTML()` | 지도 범례 HTML |
| `initScenario()` | 시나리오 레버 UI |
| `initComparisonToggle()` | 비교 도시 선택 UI |

---

## 7. CSS 구조 (style.css)

| 섹션 | 내용 |
|------|------|
| 섹션 1–5 | CSS 변수, 리셋, 기본 레이아웃 |
| 섹션 6–10 | 헤더, 사이드바, 지도 패널 |
| 섹션 11–15 | 차트, 탭, 비교, 검색 |
| 섹션 16–22 | 범례, 시나리오, 반응형 |
| **섹션 23** | 랜딩 화면 전체 (포털 v2) |
| **섹션 23-b** | WHY 섹션 + 5대 권역 섹션 |

### 주요 CSS 변수
```css
--primary: #2D5F3F        /* 메인 녹색 */
--primary-light: #3A7A52
--accent: #D4A574         /* 골든 액센트 */
--samlter: #4A90D9        /* 삶터 파랑 */
--ilter: #E8A44A          /* 일터 주황 */
--shimter: #52A866        /* 쉼터 초록 */
--fs-xs/sm/body/md/lg/xl/2xl/3xl  /* 폰트 크기 스케일 */
--space-1 ~ --space-12    /* 스페이싱 스케일 */
--radius-sm/md/lg/xl/pill /* 라운딩 */
```

---

## 8. 랜딩 화면 구조 (index.html #landing-screen)

```
#landing-screen
├── .landing-bg-glow (×2 애니메이션 오브)
└── .landing-scroll-wrap
    └── .landing-portal
        ├── nav.landing-nav (로고 + 탐색 링크)
        ├── section.landing-hero-v2 (--anim-order:1)
        │   ├── .hero-copy (타이틀, 설명, CTA)
        │   └── .hero-visual (KPI 카운터 3개 + SVG 미니맵)
        ├── section.landing-why (--anim-order:3)
        │   └── .landing-pillars (pillar--samlter/ilter/shimter)
        ├── section.landing-zones (--anim-order:4)
        │   └── .landing-zones-grid--5 (5개 zone 카드)
        ├── section.landing-bento (--anim-order:5)
        │   └── .bento-grid (5개 카드: map/compare/scenario/namyangju/indicators)
        └── footer.landing-footer-v2 (--anim-order:6)
#landing-toast (토스트 알림)
```

**랜딩은 매 방문마다 표시** (sessionStorage 건너뛰기 없음).  
"지도로 탐색하기" 또는 bento 카드 클릭 → `#landing-screen.is-hidden`, 대시보드 표시.

---

## 9. 5대 권역 분류 (보고서 표 2-36 기준)

| 권역 | 클래스 | 시군 |
|------|--------|------|
| 경계도시형 (북부) | `zone--north-border` | 양주시, 동두천시, 포천시 |
| 농업생산형 (남부) | `zone--south-farm` | 안성시, 여주시, 이천시 |
| 서해안형 (서부) | `zone--west-coast` | 평택시, 화성시, 오산시 |
| 산지전원형 (동부) | `zone--east-mountain` | 가평군, 양평군 |
| 도농전환형 (도심근교) | `zone--urban-edge` | 남양주시, 용인시, 광주시, 하남시 |

CSS 그리드: 6컬럼, 3+2 비대칭 (1~3번 `1/3·3/5·5/7`, 4~5번 `2/4·4/6`)

---

## 10. GeoJSON 인코딩 주의사항

⚠️ **`gyeonggi-sigun.geojson`의 `properties.name`은 이중 이스케이프 상태**  
(`"\\uC2A4"` 형태) — 브라우저에서 읽으면 `스` 문자열로 나옴 (한글 아님).

✅ **반드시 `CITIES[cityId].name` 사용**:
```javascript
// 잘못된 방법 (garbled text)
const name = feature.properties.name;  // "\\uB0A8..."

// 올바른 방법
const cityId = feature.properties.id;
const name = (CITIES[cityId] && CITIES[cityId].name) || cityId;
```
`properties.id`는 영문 소문자 (`'namyangju'`, `'gapyeong'` 등) — 정상 사용 가능.

---

## 11. 현재 구현 상태

### ✅ 완료된 기능
- Leaflet 코로플레스 지도 (줌 기반 읍면 레이어 전환)
- 공통지표 11개 + 남양주 자율지표 8개 데이터
- 카테고리 종합 가상 지표 (삶터/일터/쉼터 종합)
- Chart.js 레이더/막대 차트
- 도시 비교 UI
- 시나리오 레버 UI
- 랜딩 포털 v2 (히어로·KPI·미니맵·WHY·5권역·Bento)
- 5대 권역 분류 (보고서 표 2-36 기준)
- 베이스맵 선택 (7종) — Positron 기본
- **시군 랭킹 페이지** (`#ranking-screen`, hash `#ranking`) — 4 탭 + 포디움 + 리스트
- **지표 가이드 페이지** (`#guide-screen`, hash `#guide`) — 카테고리별 공통/자율 카드

### 🚧 준비 중
- **데이터 출처 페이지** (`data-action="sources"`) — toast 안내 중

---

## 12. 시나리오 레버 (SCENARIO_LEVERS)

5개 정책 레버 — 슬라이더로 값 조절, 레이더 차트 before/after 비교:
- 생활SOC 시설 추가 → L4 영향
- 청년 귀농 지원 → W6 영향
- 친환경 농가 전환 → W7 영향
- 수변·생태공원 조성 → R6 영향
- 농촌체험 프로그램 추가 → R4 영향

---

## 13. 코딩 컨벤션

- **한글 주석 사용** (사용자·팀원이 한국어)
- `'use strict';` 선언
- 섹션 구분: `// ===...=== 섹션명 ===...===`
- CSS 섹션 구분: `/* ===...=== 섹션명 ===...=== */`
- 모든 init 함수는 `DOMContentLoaded` 핸들러에서 호출
- Mock 데이터 사용 중 (실제 API 연동 없음)

---

## 14. 개발 서버

```bash
# Python 3
python -m http.server 8765 --directory "C:\Users\liber\Dropbox\04_Tasks\04_수업\지역활성화시스템론\Web"
# → http://localhost:8765
```

---

## 15. 수정 시 체크리스트

1. `index.html` 변경 → 열고 있는 `<div>` 태그 닫힘 확인
2. `style.css` 변경 → CSS 변수(`--primary`, `--samlter` 등) 재사용
3. `app.js` 변경 → `CATEGORY_TOTALS` 가상 키 처리 누락 없이
4. GeoJSON 관련 → `properties.name` 사용 금지, `CITIES[id].name` 사용
5. 새 지표 추가 → `INDICATORS` + `CITIES` 각 도시 데이터 동시 업데이트
6. 랜딩 섹션 추가 → `--anim-order` 값 순서 확인
