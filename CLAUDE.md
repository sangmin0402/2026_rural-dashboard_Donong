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
├── index.html          # 단일 페이지 앱 (랜딩 + 대시보드 + 오버레이)
├── CLAUDE.md           # ← 이 파일
├── css/
│   └── style.css       # 전체 스타일
├── js/
│   └── app.js          # 전체 앱 로직 (프레임워크 없음)
├── dat/
│   ├── gyeonggi-sigun.geojson   # 15개 시군 폴리곤 (인코딩 주의 — 아래 10번 참조)
│   ├── gyeonggi-dong.geojson    # 읍면동 폴리곤 (줌 11+ 표시)
│   ├── gyeonggi-ri.geojson      # 행정리 폴리곤 (줌 13+ 표시, ~1.4MB)
│   └── region-meta.json         # KOSIS+SGIS+manual 통계 캐시 — 3-layer (raw/computed/manual)
├── docs/
│   └── DATA-SOURCES.md          # 21지표 × KOSIS·SGIS·외부 출처 매핑 마스터
└── scripts/                     # 데이터 가공 (Python)
    ├── lib_meta.py              # 공통 모듈 (3-layer 스키마, 산식, 상수)
    ├── fetch_kosis.py           # KOSIS Open API → 인구·세대수 (source='kosis:*')
    ├── fetch_sgis.py            # SGIS Open API → 노령화·사업체·농가 등 (source='sgis:*')
    ├── process_ri.py            # SHP → GeoJSON 변환
    ├── requirements.txt
    └── README.md
```

### region-meta.json — 3-layer 스키마
```jsonc
sigun[cityId] = {
  raw:      {
    population: { value, year, source: 'kosis:DT_1B040A3' },
    aging_idx:  { value, year, source: 'sgis:main_stats' },
    ...
  },
  computed: { L1_pop_growth_rate: { value, unit, formula, inputs }, L2_aging_index: {...}, ... },
  manual:   { W3_fiscal_independence: { value, year, source, updated_by, ... }, ... }
}
```
- `raw`: KOSIS·SGIS API 원본 — 각 필드에 `source` 메타로 출처 구분
- `computed`: raw로부터 산식 계산 (`scripts/lib_meta.py` 의 `compute_indicators()`)
- `manual`: 사용자 직접 입력 — 두 fetch 스크립트가 모두 보존
- **source-aware merge**: `merge_raw_by_source(existing, new_raw, 'kosis')` → KOSIS source raw 만 덮어씀, SGIS raw 와 manual 보존 (반대도 동일)
- UI는 `renderKosisSigunStats()`의 `readField(key)`로 3-layer 통합 조회 (우선순위: computed > raw > manual)

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

### 자율지표 풀 10개 (`JAYUL_INDICATORS_POOL`) — **15시군 모두 적용**
L5(귀촌인 증감률), L6(3년 귀촌 규모 유지율), W5(농업 세대교체), W6(청년 귀농 유입), W7(친환경 인증 농가), R4(체험 프로그램), R5(양호수질 하천), R6(수변·생태쉼터), **R8(국가유산)**, **W8(서비스판매 종사자)**

#### 핵심 컨셉: 시군별 "선정" 시스템

- **모든 시군에 10개 자율지표 값이 계산되어 있음** (`city.jayulIndicators` — 결정론적 mock + SGIS 일부)
- **각 시군은 자기들의 자율지표를 선정** (`city.selectedJayulKeys`) → 농촌다움 종합 점수에 포함
- **권역별 기본 선정** (`RECOMMENDED_JAYUL_BY_ZONE`):
  | 권역 | 선정 자율지표 |
  |------|--------------|
  | 경계도시형 (북부) | W6 · L6 · R5 · R8 |
  | 농업생산형 (남부) | W5 · W7 · R4 · W6 |
  | 서해안형 (서부) | W7 · W8 · R5 · R6 |
  | 산지전원형 (동부) | L5 · R5 · R8 · R6 |
  | 도농전환형 (도심근교) | L5 · L6 · R4 · W8 (남양주는 기존 8개 유지) |
- **UI**: 모든 후보 카드 표시, 선정된 카드는 강조(`.is-selected`), 비선정은 회색(`.is-candidate`)

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
| `initAnalysisView()` / `switchAnalysisPurpose(key)` | 기능별 분석 탭 초기화·목적 전환 |
| `renderAnalysisScatter(cfg)` / `renderAnalysisHeatmap(cfg)` | 산점도·히트맵 렌더 |
| `initRiLayer()` / `updateRiVisibility()` | 행정리 GeoJSON 로드·줌 토글 |
| `loadRegionMeta()` | KOSIS 캐시(`region-meta.json`) 로드 |
| `selectDong/Ri()` / `clearDongSelection/RiSelection()` | 드릴다운 선택/해제 |
| `getDongInfo()` / `getRiInfo()` | 메타정보 조회 (KOSIS 우선, mock fallback) |
| `renderRegionBreadcrumb()` | 시군 › 읍면 › 행정리 path UI |
| `highlightSelectedDongOnMap()` / `highlightSelectedRiOnMap()` | 지도 폴리곤 강조 |
| `selectDong(admCd, admNm, cityId)` / `clearDongSelection()` | 읍면 드릴다운 진입·복귀 |
| `renderRegionBreadcrumb()` / `showDongDetailPanel()` / `getDongInfo()` | breadcrumb·읍면 패널·mock 메타정보 |
| `highlightSelectedDongOnMap(admCd)` | 선택된 읍면 폴리곤 강조 |
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

### ✅ 완료된 기능 (최신)

**🆕 0531 현장조사·시사점·비전 통합 (feat/0531-field-survey-vision 브랜치, 2026-05-31)**:
팀 자료 3종(트리거 HTML·현장조사 xlsx·비전 docx)을 통합. **읍면 클릭 시** 비전 적합도+트리거+시사점 표출.
- **지표 ID 정규화 레이어** ⚠️중요: 4개 자료의 키가 어긋남. 표준=CANON(xlsx 확정안: W9=농촌체험, R4=양호수질, R5=수변쉼터, R6=도시텃밭, R7=주말농원). `namyangju-dong-mock.json`은 키가 한 칸 밀림(`R4_experience_prog`=W9, `R5_water_quality`=R4, `R6_park_per_capita`=R5), `CITIES.namyangju.jayulIndicators`도 앱 내부 번호 사용. **반드시 `getEupIndicator(eup, canon)` / `getEupAllIndicators(eup)` 경유**(직접 키 접근 금지). 상수: `CANON_TO_MOCK`, `CANON_TO_REF`, `SIGUN_EXTRA`.
- **#2 읍면 비교 강화**: `dat/simulation/namyangju-field-survey.json`(9개 농촌 읍면, W5·W7·L4·L6·W6·W9·R6·R7). `scripts/build_field_survey.py`로 재생성. `DONG_COMPARE_INDICATORS` CANON 키로 교체, 표·차트에 출처 배지(`EUP_SOURCE_BADGE`: field/sim/sigun).
- **#3 시사점 도출**: `dat/namyangju-triggers.json`(15트리거+근거+카드). 엔진 `evalRule`/`firedTriggerIds`/`buildInsightCards`/`renderEupTriggerCards`/`interpolateCard`.
- **#4 비전 적합도**: `VISION_AXES`(T/H/E)·`normIndicator`(읍면 분포 min-max, L2 역방향)·`visionScore`·`renderVisionScoreCard`. docx 반영 '잠재 vs 체감' 분리 막대.
- **후킹**: `showDongDetailPanel` 끝 `renderEupAnalysis(admNm,cityId,info)` → 남양주 읍면만 표시(urban 동은 시뮬레이션 폴백 안내), `clearEupAnalysis`로 정리. CSS 섹션 40(`nyj-*`). 미반영: #6 읍면담당자/조회자 토글(자료 대기)·R5 GIS(`_pending`).

**🆕 0531 실시간 LLM AI 해석 (#5, MindLogic UOS Gateway)**:
- ⚠️ 보안: 정적 사이트라 비밀키 클라이언트 금지. **Cloudflare Worker 프록시 `worker/`** 가 키 보관(`wrangler secret`·로컬 `worker/.dev.vars`=gitignore). 클라이언트는 키 없이 컨텍스트만 전송. 게이트웨이 OpenAI 호환 `POST /chat/completions`(⚠️끝 슬래시 없음), 모델 `claude-sonnet-4-6`, `max_tokens 1500`(짧으면 한국어 JSON 잘림).
- 클라이언트: `js/config.js`의 `window.LLM_PROXY_URL`(공개값, 비밀 아님). 비면 LLM 비활성→정적 폴백. `app.js`: `llmEnabled`/`buildLlmContext`(시군·읍면)/`llmInterpret`(sessionStorage 캐시+force 재생성)/`escapeHtml`. 시군=`renderAiInterpretationCard`에 `wireLlmButton`→`applyLlmToSigunCard`. 읍면=`renderEupLlmBlock`→`renderEupLlmResult`(컨테이너 `#eup-llm-interpret`). CSS 섹션 41.
- 응답 스키마: `{headline,strengths[],weaknesses[],policy_recommendation,vision_comment,priority_actions[]}`. 배포·로컬 절차: `worker/README.md`.

**🆕 0531 "AI에게 물어보세요" 대화형 Q&A + 정적 지표 해석**:
- 모델 **`gpt-5.4-nano`**로 통일(벤치마크: 카드·챗 모두 정상·최저토큰. haiku=게이트웨이 500, gemini-flash=추론토큰 과다). 교체는 `worker/src/index.js` `MODEL` 1줄.
- Worker 신규 **`POST /ask`** `{question, context, history}`→`{answer}`. facts-only 시스템 프롬프트(`FACTS_RULE`), temp 0.1, max_tokens 500. `handleAsk`/`buildAskMessages`/`factsToText`.
- **핵심 원칙: 순위·등급·평균은 JS가 계산해 facts로 전달, LLM은 인용만**(환각 차단). 클라: `sigunIndicatorFact`(15시군 순위)·`eupIndicatorFact`(읍면 순위)·`buildAskContext`(현재 화면 감지: explore/읍면/시군/지도)·`askAi`·`initAskAi`(플로팅 FAB+채팅, `LLM_PROXY_URL` 없으면 숨김)·`sendAskQuestion`(히스토리 6턴).
- 정적(즉시·무료) **`renderIndicatorVerdict(cityId,key)`** = 해석(`indicator-insights.json`)+평가(등급배지+`sigunIndicatorFact` 순위)+정책(tier text). 지표 탐색 상세(`renderExploreDetail`)에 삽입. CSS 섹션 41(LLM)·42(챗·verdict).
- **정책 라이브러리→챗**: `buildAskContext`가 `attachPolicyHints`(지표 등급정책+발화 트리거 정책)·`attachVision2035Facts`(남양주 한정)로 facts 보강 → 챗이 즉흥 추론 대신 준비된 정책 인용. Worker `factsToText`가 `ctx.policies`·`ctx.vision2035` 렌더, `/ask` 프롬프트가 정책질문 시 이들 우선 활용.

**🆕 0531 #6 조회자/읍면담당자 토글 + 말투**:
- 기존 일반/관리자 토글을 **조회자(👁️)/읍면담당자(🛠️)**로 라벨 변경(내부 값 `public`/`admin` 유지). "이해 vs 액션" 분리: 조회자=해석·평가·비전·정책 이해 중심, 읍면담당자=거기에 "다음 단계(담당자 액션)·추가 필요 데이터"(트리거 카드 셀에 `.admin-only` 부여)·관리자 편집 패널까지. 토글 시 `showInlineToast`로 모드 안내. CSS `.admin-only`(body.view-admin) 재사용 — 토글은 CSS-driven, 재렌더 불필요.
- LLM 말투: Worker `TONE_RULE`(부드러운 존댓말 "~입니다/~예요", 개조식 금지)을 카드·`/ask` 프롬프트에 적용.
- **읍면 현장조사 직접 입력 폼**(읍면담당자): `renderEupFieldEditPanel`(컨테이너 `#eup-field-edit`, admin-only). 8개 현장지표(L4·L6·W5·W6·W7·W9·R6·R7) 입력→`state.eupOverrides[eup][canon]`+localStorage(`EUP_OVERRIDES_STORAGE_KEY`). `getEupIndicator`가 **officer override를 최우선**(source `officer`=담당자입력 배지)으로 읽음. 저장 시 `_visionPopCache=null` 후 `renderEupAnalysis` 재호출 → 비전·트리거·시사점 즉시 재계산. (검증: L4 58.3→95 시 H축 40→80·종합 49→62·생활SOC취약 트리거 해제)

**🆕 0531 2035 비전 달성률 (박세희, `namyangju-vision-2035.json`)**:
- 출처 「2035 남양주 도시기본계획」. **시 전체 절대목표 대비 달성률**(읍면 상대 visionScore와 보완). 7수치지표(공원면적 24.5%~고용 87%)+4방향성+삶/일/쉼 영역점수(쉼터 34 최저). `vision2035` 전역, `renderVision2035Card(cityId)`(남양주만, `updateDetailPanel`에서 호출), CSS 섹션 43(`v35-*`). 핵심 인사이트=녹색문화도시 비전 vs 공원면적 24.5% 괴리.

**🆕 5/18 피드백 반영 (feat/feedback-0518 브랜치, 2026-05)**:
- **시사점 카드** (`renderInsightCard`): 시군 패널에 등급별 시사점 텍스트 (피드백 #3) — `dat/indicator-insights.json`
- **AI 해석 카드** (`renderAiInterpretationCard`): 시군별 강점·약점·정책 권고 (피드백 #5) — `dat/ai-interpretations.json` (정적 텍스트, LLM 미사용)
- **일반/관리자 토글** (헤더 `view-mode-toggle`): `body.view-admin` 클래스 + `.admin-only` 게이팅 (피드백 #6)
  - `state.viewMode: 'public' | 'admin'`, `state.manualOverrides: { [cityId]: {key: ...} }`
  - `renderAdminEditPanel`: 자율지표 선정 체크박스(최대 4개) + manual 층 편집 폼 (W3 재정자립도·관리자 메모) → localStorage 저장
  - `readField()` 에서 admin 오버라이드를 computed/raw/manual 보다 우선 적용
- **남양주 16개 읍면 비교** (`renderDongComparison`, 피드백 #2): 클러스터별(urban/transit/rural) 칩 + 9지표 드롭다운 + Chart.js 막대 + 16×9 표
- **시뮬레이션 데이터** (피드백 #7): `scripts/generate_mock_dong.py` → `dat/simulation/namyangju-dong-mock.json` (16개 읍면, SHA-256 결정론적)
  - `loadSimulationData`(`loadRegionMeta` 내부), `getSimulationDongIndicators`, `listSimulationDongs`
  - `getDongInfo()` 에서 시뮬레이션 우선, `_source: 'simulation'` 표시
- **UI 검토**: impeccable 디자인 진단(`docs/IMPECCABLE-AUDIT.md`) + UX 벤치마크(`docs/UX-BENCHMARK.md`)

새 함수·상태 요약:
| 추가/변경 | 위치 |
|----------|------|
| `state.viewMode`, `state.manualOverrides` | `js/app.js` ~ state |
| `initViewModeToggle`, `applyViewMode` | `js/app.js` |
| `renderAdminEditPanel`, `saveAdminEdits`, `resetAdminEdits`, `showInlineToast` | `js/app.js` |
| `renderInsightCard`, `classifyIndicatorTier`, `getIndicatorInsight`, `getZoneInsight` | `js/app.js` |
| `renderAiInterpretationCard`, `getAiInterpretation` | `js/app.js` |
| `renderDongComparison`, `bindDongCompareInteractions`, `drawDongCompareChart` | `js/app.js` |
| `DONG_COMPARE_INDICATORS`, `CLUSTER_LABELS`, `DONG_COMPARE_MAX_SELECT` | `js/app.js` (상단 데이터) |
| `dongCompareSelection`, `dongCompareIndicator`, `dongCompareChart` | `js/app.js` (상태) |
| `getSimulationDongIndicators`, `listSimulationDongs` | `js/app.js` |
| `indicatorInsights`, `aiInterpretations`, `simulationData` | `js/app.js` (전역 데이터) |
| `.view-mode-toggle`, `.view-mode-btn`, `.admin-only` | `style.css` §6 / §37 |
| `.insight-card`, `.insight-item.*` | `style.css` §36 |
| `.admin-edit-panel`, `.admin-jayul-*`, `.admin-manual-*`, `.admin-btn`, `.admin-inline-toast` | `style.css` §37 |
| `.dong-compare-section`, `.dong-compare-cluster`, `.dong-compare-chip`, `.cluster-tag`, `.data-status-badge.status-simulation` | `style.css` §38 |
| `.ai-card`, `.ai-card-pros-cons`, `.ai-card-policy`, `.ai-card-badge` | `style.css` §39 |

**🆕 시군 패널 UX 재배열 (feat/indicator-explorer 브랜치)**:
- 점수 카드(삶터·일터·쉼터) → 레이더 차트 위로 이동
- 자율지표 섹션 → 세부지표 다음·KOSIS 토글 앞
- KOSIS·SGIS 기본 통계 → 시군 패널 맨 아래, 접힘 토글 (`#kosis-toggle-btn`)

**🆕 지표 탐색 페이지 (`#explore-screen`)** — 풀스크린 오버레이:
- 좌측 사이드바: 21개 지표 (공통 11 + 자율 10), 검색·카테고리 탭
- 우측 상세: 산식/출처, 15시군 비교 표 (정렬 가능), 막대 차트, 미니 코로플레스, "지도에서 보기" 버튼
- 진입로: 랜딩 Bento "📊 지표 탐색" 카드 / 지도 우측 패널의 지표 카드 클릭 / `#explore` 또는 `#explore/L1` 해시
- 함수: `showExplorePage(key?)`, `renderExploreSidebar()`, `renderExploreDetail(key)`, `renderExploreBarChart(key, rows)`, `renderExploreMinimap(key, rows)`, `initExploreScreen()`
- 자율지표는 "선정" 열에 ✓ 표시 (시군별 selectedJayulKeys 기반)

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
- **기능별 분석 탭** (6번째 탭 `data-tab="analysis"`) — `ANALYSIS_PURPOSES` 매핑, 통과형 식별(산점도) + 체류 전환(히트맵)
- **지역 드릴다운 3단계** — 시군↔읍면↔행정리 in-place 패널 + breadcrumb (`#region-breadcrumb`). 줌 11+ 읍면, 13+ 행정리. `region-meta.json` 있으면 KOSIS 데이터 사용, 없으면 mock + 출처 배지

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
