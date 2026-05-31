/**
 * 경기도 농촌다움 지표 웹 대시보드
 * app.js - 메인 애플리케이션 로직
 *
 * 기술스택: Leaflet.js 1.9.4 + Chart.js 4.4.0
 * 대상 시군: 경기도 15개 농촌 시군
 */

'use strict';

// ===================================================================
// === 지표 정의 ===
// ===================================================================

const INDICATORS = {
  // 삶터 (samlter) - 파란 계열
  L1: { name: '인구증가율',       unit: '%',    category: 'samlter', higherBetter: true,  spatial: '읍면', year: 2024,
        formula: '(현재인구 - 전년인구) / 전년인구 × 100' },
  L2: { name: '노령화지수',       unit: '',     category: 'samlter', higherBetter: false, spatial: '읍면', year: 2024,
        formula: '(65세 이상 / 14세 이하) × 100' },
  L3: { name: '인구순이동률',     unit: '‰',   category: 'samlter', higherBetter: true,  spatial: '시군', year: 2024,
        formula: '(전입 - 전출) / 총인구 × 1000' },
  L4: { name: '생활SOC 충족지수', unit: '%',    category: 'samlter', higherBetter: true,  spatial: '읍면', year: 2024,
        formula: '보유 SOC 항목 / 전체 항목 × 100' },
  // 일터 (ilter) - 주황 계열
  W1: { name: '고용률',           unit: '%',    category: 'ilter',   higherBetter: true,  spatial: '시군', year: 2024,
        formula: '취업자 / 생산가능인구 × 100' },
  W2: { name: '사업체수',         unit: '개',   category: 'ilter',   higherBetter: true,  spatial: '읍면', year: 2023,
        formula: '지역 내 등록 사업체 수' },
  W3: { name: '재정자립도',       unit: '%',    category: 'ilter',   higherBetter: true,  spatial: '시군', year: 2024,
        formula: '(지방세 + 세외수입) / 일반회계 예산 × 100' },
  W4: { name: 'GRDP',             unit: '억원', category: 'ilter',   higherBetter: true,  spatial: '시군', year: 2022,
        formula: '지역내총생산 (당해년 가격)' },
  // 쉼터 (shimter) - 초록 계열
  R1: { name: '농촌환경 보전율',        unit: '%', category: 'shimter', higherBetter: true, spatial: '읍면', year: 2024,
        formula: '보전지역 면적 / 농촌 전체 면적 × 100' },
  R2: { name: '토지이용 다양성 지수',   unit: 'H', category: 'shimter', higherBetter: true, spatial: '읍면', year: 2023,
        formula: 'Shannon H = -Σ(pi × ln pi)' },
  R3: { name: '녹지율',                 unit: '%', category: 'shimter', higherBetter: true, spatial: '읍면', year: 2023,
        formula: '녹지 면적 / 전체 면적 × 100' },
};

// ===================================================================
// === 남양주 자율지표 정의 ===
// ===================================================================

// 자율지표 풀 — 15개 시군이 모두 값을 가지고 있고, 각 시군이 자기들이 "선정"한 지표만
// 농촌다움 종합 점수에 포함됨. 시군별 selectedJayulKeys 로 선정 여부 제어.
const JAYUL_INDICATORS_POOL = {
  L5: { name: '귀촌인 증감률',          unit: '%',      category: 'samlter', higherBetter: true, spatial: '시군',   year: 2023 },
  L6: { name: '3년 귀촌 규모 유지율',   unit: '%',      category: 'samlter', higherBetter: true, spatial: '시군',   year: 2023 },
  W5: { name: '농업 세대교체 수준',      unit: '%',      category: 'ilter',   higherBetter: true, spatial: '읍면동', year: 2022 },
  W6: { name: '청년 귀농 유입 비율(20~39세)', unit: '%', category: 'ilter', higherBetter: true, spatial: '시도', year: 2024 },
  W7: { name: '친환경 인증 농가 비율',   unit: '%',      category: 'ilter',   higherBetter: true, spatial: '시도',   year: 2023 },
  R4: { name: '인구 1천명당 체험 프로그램', unit: '건/천명', category: 'shimter', higherBetter: true, spatial: '읍면', year: 2024 },
  R5: { name: '양호수질 하천 비율',      unit: '%',      category: 'shimter', higherBetter: true, spatial: '읍면',   year: 2023 },
  R6: { name: '수변·생태쉼터 면적',     unit: '㎡/천명', category: 'shimter', higherBetter: true, spatial: '읍면',  year: 2024 },
  // ── 신규 (와이어프레임 0518 — 데이터 미수집, 시각화 구조만 사전 등록) ──
  R8: { name: '국가유산',               unit: '개',      category: 'shimter', higherBetter: true, spatial: '시군',   year: 2025, source: '문화재청', pending: true },
  W8: { name: '서비스판매 종사자',       unit: '명',      category: 'ilter',   higherBetter: true, spatial: '시군',   year: 2023, source: 'KOSIS 전국사업체조사', pending: true },
};

// ===================================================================
// === 지표 시사점·정책 제안 (피드백 #3 #5) ===
// ===================================================================
//   indicator-insights.json 의 텍스트를 시군별 등급에 맞춰 골라내는 헬퍼.
//   각 지표가 "단순 수치"를 넘어 "그래서 어떻게?" 까지 답변하도록.

/**
 * 시군의 어떤 지표 점수가 5분위 중 어디(high/mid/low)에 해당하는지 판정.
 * 정렬은 항상 값 기준 내림차순. 1~5 등급 → high(1~2), mid(3), low(4~5).
 */
function classifyIndicatorTier(cityId, indicatorKey) {
  const myVal = (typeof getCityIndicatorValue === 'function')
    ? getCityIndicatorValue(cityId, indicatorKey)
    : (CITIES[cityId]?.indicators?.[indicatorKey] ?? CITIES[cityId]?.jayulIndicators?.[indicatorKey]);
  if (myVal == null) return null;
  const allVals = Object.keys(CITIES).map(cid => {
    const v = CITIES[cid]?.indicators?.[indicatorKey];
    if (v != null) return v;
    return CITIES[cid]?.jayulIndicators?.[indicatorKey];
  }).filter(v => v != null);
  if (allVals.length < 3) return null;
  const sorted = [...allVals].sort((a, b) => b - a);  // 큰 값 먼저
  const idx = sorted.findIndex(v => v === myVal) + 1;
  const tier = Math.ceil((idx / sorted.length) * 5);
  const meta = INDICATORS[indicatorKey] || JAYUL_INDICATORS_POOL[indicatorKey];
  // higherBetter=false 면 등급 반전 (낮은 값이 좋은 등급)
  const adjustedTier = meta?.higherBetter === false ? (6 - tier) : tier;
  if (adjustedTier <= 2) return 'high';
  if (adjustedTier >= 4) return 'low';
  return 'mid';
}

/**
 * 특정 시군·지표에 맞는 시사점 텍스트 반환.
 * @returns {{ interpretation, tierText, tier } | null}
 */
function getIndicatorInsight(cityId, indicatorKey) {
  if (!indicatorInsights || !indicatorInsights.indicators) return null;
  const block = indicatorInsights.indicators[indicatorKey];
  if (!block) return null;
  const tier = classifyIndicatorTier(cityId, indicatorKey);
  const tierText = (tier && block[tier]) || null;
  return {
    interpretation: block.interpretation,
    tierText,
    tier,
  };
}

/**
 * 시군의 권역 요약 텍스트.
 */
function getZoneInsight(cityId) {
  if (!indicatorInsights || !indicatorInsights.by_zone) return null;
  const zone = (typeof CITY_ZONE !== 'undefined') ? CITY_ZONE[cityId] : null;
  return zone ? indicatorInsights.by_zone[zone] : null;
}

/**
 * AI 해석 데이터 조회 — 시군별 / 권역별 / 지표×등급별 (피드백 #5)
 * 본 데이터는 정적 사전 작성 텍스트로, 향후 LLM 동적 분석으로 대체될 예정.
 *
 * @param {string} cityId 시군 ID (예: 'namyangju')
 * @param {string} [indicatorKey] 선택: 특정 지표 키 (L1/L2/.../R6) — 등급별 해석 추가
 * @returns {{ city: object|null, zone: object|null, indicatorTier: string|null }}
 */
function getAiInterpretation(cityId, indicatorKey) {
  if (!aiInterpretations) return { city: null, zone: null, indicatorTier: null };
  const zoneKey = (typeof CITY_ZONE !== 'undefined') ? CITY_ZONE[cityId] : null;
  let indicatorTier = null;
  if (indicatorKey) {
    const tier = (typeof classifyIndicatorTier === 'function')
      ? classifyIndicatorTier(cityId, indicatorKey)
      : null;
    if (tier) {
      const baseKey = indicatorKey.split('_')[0]; // L1_pop_growth → L1
      const tk = `${baseKey}_${tier}`;
      indicatorTier = (aiInterpretations.by_indicator_tier && aiInterpretations.by_indicator_tier[tk]) || null;
    }
  }
  return {
    city: (aiInterpretations.by_city && aiInterpretations.by_city[cityId]) || null,
    zone: (zoneKey && aiInterpretations.by_zone && aiInterpretations.by_zone[zoneKey]) || null,
    indicatorTier,
  };
}

// 카테고리 종합 가상 지표 키 매핑
const CATEGORY_TOTALS = {
  samlter_total: { category: 'samlter', label: '삶터 종합' },
  ilter_total:   { category: 'ilter',   label: '일터 종합' },
  shimter_total:  { category: 'shimter',  label: '쉼터 종합' },
};

// region-meta.json에서 점수 산정용 CITIES 값으로 실제 반영하는 필드 목록.
// 여기에 없는 지표는 명시적으로 mock/후보 데이터로 남긴다.
const SCORE_SOURCE_OVERRIDES = {
  common: {
    L1: { layer: 'computed', key: 'L1_pop_growth_rate' },
    L2: { layer: 'computed', key: 'L2_aging_index' },
    L3: { layer: 'computed', key: 'L3_net_migration_rate' },
    W2: { layer: 'computed', key: 'W2_business_count' },
    W3: { layer: 'manual',   key: 'W3_fiscal_independence' },
    W4: { layer: 'manual',   key: 'W4_grdp' },
  },
  jayul: {
    W5: { layer: 'computed', key: 'W5_agri_young_manager_ratio' },
    W6: { layer: 'computed', key: 'W6_young_return_farm_ratio' },
    W7: { layer: 'computed', key: 'W7_eco_certified_farm_ratio' },
    R4: { layer: 'computed', key: 'R4_experience_programs_per_1000' },
    R5: { layer: 'computed', key: 'R5_good_water_rate' },
    R6: { layer: 'computed', key: 'R6_park_area_per_1000' },
    W8: { layer: 'computed', key: 'W8_service_sales_workers' },
    R8: { layer: 'manual',   key: 'R8_heritage_count' },
  },
};

// ===================================================================
// === 기능별 분석 — 분석 목적 → 시각화 유형 매핑 ===
// ===================================================================

const ANALYSIS_PURPOSES = {
  'pass-through': {
    label: '통과형 식별',
    vizType: 'scatter',
    title: '통과형 vs 정주형 분포',
    description:
      '인구 유입은 활발하지만 재정자립이 낮으면 "통과형" 가능성이 높습니다. ' +
      '반대로 둘 다 높으면 "정주형"으로 판단할 수 있습니다. ' +
      '15개 시군이 4개 사분면 중 어디에 위치하는지 확인하세요.',
    axes: {
      x: { key: 'L3', label: '인구순이동률 (‰)',  explain: '높을수록 유입 활발' },
      y: { key: 'W3', label: '재정자립도 (%)',     explain: '높을수록 정주·자립 강함' },
    },
    quadrantHints: [
      '🟢 우상단 — 정주·자립형',
      '🟠 우하단 — 통과형 (집중 모니터링)',
      '🔵 좌상단 — 안정 보전형',
      '⚪ 좌하단 — 쇠퇴 주의',
    ],
  },
  'stay-conversion': {
    label: '체류 전환',
    vizType: 'heatmap',
    title: '시군 × 정주지표 매트릭스',
    description:
      '한 시군 행에서 색이 균일하게 진하면 다방면에서 정주 기반이 강해 ' +
      '"체류 전환" 잠재력이 큰 시군입니다. 특정 칸만 진하면 해당 지표의 단편적 강점.',
    // 모든 15개 시군이 공통으로 보유한 지표만 사용 (남양주 전용 R6 등 제외)
    indicators: ['L1', 'L4', 'W1', 'W3', 'R1', 'R3'],
  },
};

// ===================================================================
// === 시나리오 레버 정의 ===
// ===================================================================

const SCENARIO_LEVERS = [
  { id: 'soc',         label: '생활SOC 시설 추가',      unit: '개',   min: 0, max: 10,  step: 1,
    affectsIndicator: 'L4', effectPerUnit: 2.5,
    description: '읍면당 사회기반시설 추가 시 생활SOC 충족지수 향상' },
  { id: 'returnFarm',  label: '청년 귀농 지원 확대',     unit: '명',   min: 0, max: 100, step: 10,
    affectsIndicator: 'W6', effectPerUnit: 0.1,
    description: '청년 귀농 지원 인원 추가 시 유입 비율 향상' },
  { id: 'greenFarm',   label: '친환경 농가 전환 지원',   unit: '%',    min: 0, max: 20,  step: 2,
    affectsIndicator: 'W7', effectPerUnit: 1,
    description: '친환경 인증 농가 비율 직접 증가' },
  { id: 'park',        label: '수변·생태공원 조성',      unit: '개소', min: 0, max: 5,   step: 1,
    affectsIndicator: 'R6', effectPerUnit: 200,
    description: '수변·생태쉼터 면적(㎡/천명) 증가' },
  { id: 'program',     label: '농촌체험 프로그램 추가',  unit: '개',   min: 0, max: 20,  step: 2,
    affectsIndicator: 'R4', effectPerUnit: 0.05,
    description: '농촌체험 프로그램 운영 건수 증가' },
];

// ===================================================================
// === Mock 데이터: 15개 시군 ===
// ===================================================================

const CITIES = {
  namyangju: {
    id: 'namyangju', name: '남양주시',
    lat: 37.64, lng: 127.22,
    type: '도농복합시',
    description: '수도권 접근성 우수, 팔당호·북한강 수변자원, 귀촌 인기 지역',
    indicators: {
      L1: 0.8,   L2: 95,    L3: 8.2,  L4: 72.0,
      W1: 63.5,  W2: 8420,  W3: 28.4, W4: 18500,
      R1: 52.3,  R2: 1.52,  R3: 68.4,
    },
    jayulIndicators: {
      L5: 12.4, L6: 84.2,
      W5: 18.3, W6: 38.57, W7: 15.8,
      R4: 3.4,  R5: 78.5, R6: 2840,
      R8: 12,            // 국가유산 (mock — 문화재청 수동 수집 전)
      W8: 67698,         // 서비스판매 종사자 (SGIS 도소매+숙박음식 합산값 동기)
    },
    // 남양주가 농촌다움 종합점수 산정 시 "우리 시군의 자율지표"로 선정한 키들
    selectedJayulKeys: ['L5', 'L6', 'W5', 'W6', 'W7', 'R4', 'R5', 'R6'],
  },
  gapyeong: {
    id: 'gapyeong', name: '가평군',
    lat: 37.83, lng: 127.51,
    type: '군',
    description: '산림 풍부, 인구 적음, 노령화 심각, 관광 강점',
    indicators: {
      L1: -1.4,  L2: 198,   L3: -5.8,  L4: 43.0,
      W1: 56.2,  W2: 1870,  W3: 11.2,  W4: 3200,
      R1: 68.5,  R2: 1.61,  R3: 82.3,
    },
  },
  yangpyeong: {
    id: 'yangpyeong', name: '양평군',
    lat: 37.49, lng: 127.49,
    type: '군',
    description: '수도권 귀촌지, 북한강 환경 우수, 친환경 농업',
    indicators: {
      L1: 0.3,   L2: 154,   L3: 2.1,  L4: 55.0,
      W1: 58.4,  W2: 3240,  W3: 13.7, W4: 4800,
      R1: 61.2,  R2: 1.58,  R3: 76.8,
    },
  },
  yeoju: {
    id: 'yeoju', name: '여주시',
    lat: 37.30, lng: 127.64,
    type: '시',
    description: '도자기·역사 문화, 중간 규모, 남한강 수계',
    indicators: {
      L1: -0.5,  L2: 162,   L3: -1.8,  L4: 58.0,
      W1: 60.1,  W2: 4150,  W3: 17.3,  W4: 7600,
      R1: 44.7,  R2: 1.43,  R3: 61.2,
    },
  },
  icheon: {
    id: 'icheon', name: '이천시',
    lat: 37.27, lng: 127.44,
    type: '시',
    description: '농업·도자기 특화, 비교적 경제 활발, SK하이닉스 입지',
    indicators: {
      L1: 0.6,   L2: 135,   L3: 3.4,   L4: 64.0,
      W1: 66.3,  W2: 6890,  W3: 22.8,  W4: 24300,
      R1: 39.2,  R2: 1.38,  R3: 55.6,
    },
  },
  anseong: {
    id: 'anseong', name: '안성시',
    lat: 37.01, lng: 127.28,
    type: '시',
    description: '농업 기반, 서남부 위치, 전통 남사당 문화',
    indicators: {
      L1: -0.3,  L2: 148,   L3: -0.4,  L4: 56.0,
      W1: 61.8,  W2: 5430,  W3: 18.1,  W4: 9400,
      R1: 41.5,  R2: 1.41,  R3: 58.3,
    },
  },
  yangju: {
    id: 'yangju', name: '양주시',
    lat: 37.79, lng: 127.05,
    type: '시',
    description: '도시화 진행 중, 수도권 접근성 향상, 주거지 개발',
    indicators: {
      L1: 1.2,   L2: 112,   L3: 5.6,   L4: 66.0,
      W1: 62.4,  W2: 5760,  W3: 16.4,  W4: 8700,
      R1: 32.8,  R2: 1.29,  R3: 52.1,
    },
  },
  pocheon: {
    id: 'pocheon', name: '포천시',
    lat: 37.90, lng: 127.20,
    type: '시',
    description: '군사지역 인접, 경제 낙후, 자연환경 우수, 산정호수',
    indicators: {
      L1: -0.9,  L2: 175,   L3: -3.6,  L4: 47.0,
      W1: 57.3,  W2: 3780,  W3: 12.5,  W4: 5100,
      R1: 56.4,  R2: 1.53,  R3: 72.4,
    },
  },
  dongducheon: {
    id: 'dongducheon', name: '동두천시',
    lat: 37.90, lng: 127.06,
    type: '시',
    description: '북부 경계도시, 미군기지 인접, 인구 감소·고령화 심화',
    indicators: {
      L1: -1.2,  L2: 168,   L3: -4.8,  L4: 45.0,
      W1: 56.8,  W2: 2840,  W3: 11.2,  W4: 4900,
      R1: 52.3,  R2: 1.48,  R3: 64.5,
    },
  },
  hanam: {
    id: 'hanam', name: '하남시',
    lat: 37.54, lng: 127.21,
    type: '시',
    description: '서울 동남부 접경, 미사·위례 신도시, 인구 급증, 도심근교',
    indicators: {
      L1: 2.4,   L2: 86,    L3: 13.2,  L4: 76.0,
      W1: 66.7,  W2: 8920,  W3: 31.8,  W4: 15800,
      R1: 24.3,  R2: 1.18,  R3: 34.6,
    },
  },
  gwangju: {
    id: 'gwangju', name: '광주시',
    lat: 37.41, lng: 127.25,
    type: '시',
    description: '수도권 접근 우수, 분당 인접, 급성장 도농복합',
    indicators: {
      L1: 1.1,   L2: 108,   L3: 4.9,   L4: 63.0,
      W1: 62.9,  W2: 6140,  W3: 17.8,  W4: 11200,
      R1: 35.4,  R2: 1.32,  R3: 49.8,
    },
  },
  hwaseong: {
    id: 'hwaseong', name: '화성시',
    lat: 37.20, lng: 126.80,
    type: '시',
    description: '급격한 도시화, 삼성전자 등 대형 산업단지',
    indicators: {
      L1: 2.8,   L2: 88,    L3: 14.2,  L4: 74.0,
      W1: 68.4,  W2: 14600, W3: 38.6,  W4: 52000,
      R1: 28.1,  R2: 1.24,  R3: 38.5,
    },
  },
  pyeongtaek: {
    id: 'pyeongtaek', name: '평택시',
    lat: 37.01, lng: 127.09,
    type: '시',
    description: '미군 특수, 항만, 산업 강함, 국제도시 발전',
    indicators: {
      L1: 2.1,   L2: 96,    L3: 10.4,  L4: 70.0,
      W1: 67.2,  W2: 12800, W3: 32.4,  W4: 41600,
      R1: 26.4,  R2: 1.21,  R3: 36.2,
    },
  },
  yongin: {
    id: 'yongin', name: '용인시',
    lat: 37.24, lng: 127.21,
    type: '시',
    description: '인구 많음, 반도체, 교육도시, 삼성전자 기흥',
    indicators: {
      L1: 1.5,   L2: 102,   L3: 7.3,   L4: 75.0,
      W1: 65.8,  W2: 18200, W3: 33.7,  W4: 47800,
      R1: 31.7,  R2: 1.31,  R3: 45.3,
    },
  },
  osan: {
    id: 'osan', name: '오산시',
    lat: 37.15, lng: 127.07,
    type: '시',
    description: '서해안권, 산업단지 인접, 청년 인구 비중 높음',
    indicators: {
      L1: 1.7,   L2: 78,    L3: 9.2,   L4: 67.0,
      W1: 64.2,  W2: 5320,  W3: 26.4,  W4: 9800,
      R1: 22.8,  R2: 1.16,  R3: 31.4,
    },
  },
};

// ===================================================================
// === 자율지표 풀 자동 채움 + 시군별 선정 키 부여 ===
// ===================================================================
//
// 핵심 컨셉: "자율지표는 시군마다 자기들이 선정하는 개념"
//   - 모든 자율지표(JAYUL_INDICATORS_POOL)는 15시군 모두에 값이 계산되어 있음 (raw data)
//   - 각 시군의 selectedJayulKeys 가 "농촌다움 종합 점수"에 포함될 자율지표 결정
//   - UI는 선정/후보 모두 표시하되 선정된 것은 시각적으로 강조

// 5대 권역별 권장 자율지표 (보고서 표 2-36 기준 농촌공간 유형별 특성)
const RECOMMENDED_JAYUL_BY_ZONE = {
  'north-border':  ['W6', 'L6', 'R5', 'R8'],            // 경계도시형: 귀촌 유지·수질·국가유산
  'south-farm':    ['W5', 'W7', 'R4', 'W6'],            // 농업생산형: 세대교체·친환경·체험
  'west-coast':    ['W7', 'W8', 'R5', 'R6'],            // 서해안형: 친환경·서비스판매·수변
  'east-mountain': ['L5', 'R5', 'R8', 'R6'],            // 산지전원형: 귀촌·수질·국가유산
  'urban-edge':    ['L5', 'L6', 'R4', 'W8'],            // 도농전환형: 귀촌·체험·서비스판매
};

// 시군 → 권역 매핑 (CLAUDE.md 9절 기준)
const CITY_ZONE = {
  yangju: 'north-border',  dongducheon: 'north-border', pocheon: 'north-border',
  anseong: 'south-farm',   yeoju: 'south-farm',         icheon: 'south-farm',
  pyeongtaek: 'west-coast', hwaseong: 'west-coast',     osan: 'west-coast',
  gapyeong: 'east-mountain', yangpyeong: 'east-mountain',
  namyangju: 'urban-edge', yongin: 'urban-edge',        gwangju: 'urban-edge', hanam: 'urban-edge',
};

/**
 * 시군 ID에서 결정론적 시드 생성
 */
function _jayulSeed(cityId) {
  let s = 0;
  for (let i = 0; i < cityId.length; i++) s = (s * 31 + cityId.charCodeAt(i)) % 0x7fffffff;
  return s;
}

/**
 * 결정론적 mock 자율지표 값 생성
 * @param {string} cityId
 * @returns {object} { L5: ..., L6: ..., W5: ..., ..., R8: ..., W8: ... }
 */
function generateJayulData(cityId) {
  const seed = _jayulSeed(cityId);
  const rng  = (n) => Math.abs(((seed * 9301 + 49297) >>> 0) % 233280) % n;
  const rng2 = (n) => Math.abs((((seed + 17) * 1103515245 + 12345) >>> 0) % 2147483648) % n;
  const rng3 = (n) => Math.abs(((seed * 31 + 7919) ^ 0x5A5A5A) % n);

  return {
    L5: (rng(200) / 10) - 5,         // -5 ~ 15%  (귀촌인 증감률)
    L6: 60 + rng2(35),               // 60 ~ 94%  (3년 귀촌 유지율)
    W5: 8 + rng(25),                 // 8 ~ 32%   (농업 세대교체)
    W6: 5 + rng2(30),                // 5 ~ 34%   (청년 귀농 유입)
    W7: 4 + rng3(20),                // 4 ~ 23%   (친환경 인증 농가)
    R4: parseFloat((1 + (rng(60) / 10)).toFixed(1)),    // 1.0 ~ 6.9 건/천명
    R5: 50 + rng2(45),               // 50 ~ 94%  (양호수질 하천)
    R6: 800 + rng3(3200),            // 800 ~ 3999 ㎡/천명 (수변·생태쉼터)
    R8: 3 + rng2(18),                // 3 ~ 20 개 (국가유산)
    W8: 8000 + rng(60000),           // 8000 ~ 67999 명 (서비스판매 종사자)
  };
}

// ── 모든 시군에 자율지표 풀 + 선정 키 자동 부여 ──
Object.keys(CITIES).forEach(cid => {
  const city = CITIES[cid];

  // 1) jayulIndicators 풀: 없으면 결정론적 mock으로 채움
  if (!city.jayulIndicators) {
    city.jayulIndicators = generateJayulData(cid);
  }

  // 2) selectedJayulKeys: 없으면 권역 기반 4~5개 자동 추천
  if (!city.selectedJayulKeys) {
    const zone = CITY_ZONE[cid];
    city.selectedJayulKeys = (RECOMMENDED_JAYUL_BY_ZONE[zone] || []).slice();
  }
});

// ===================================================================
// === 전역 상태 관리 ===
// ===================================================================

const state = {
  selectedCity: null,
  selectedDong: null,   // 읍면 adm_cd (드릴다운 2단계)
  selectedRi:   null,   // 행정리 adm_cd (Phase 2 — 현재 미사용)
  comparisonCities: [],
  activeTab: 'overview',
  activeIndicator: 'total',
  scenarioValues: {},
  viewMode: 'public',   // 'public' | 'admin' — 피드백 #6: 사용자 유형 토글
  manualOverrides: {},  // { [cityId]: { [key]: value } } — 관리자 수동 편집값 (localStorage 동기화)
  charts: {
    radar: null,
    comparison: null,
    scenarioBefore: null,
    scenarioAfter: null,
  },
};

// 시나리오 초기값 설정
SCENARIO_LEVERS.forEach(lever => {
  state.scenarioValues[lever.id] = 0;
});

// ===================================================================
// === 유틸리티 함수 ===
// ===================================================================

/**
 * 선형 보간으로 hex 색상 변환
 * @param {string} hex1 - 시작 색상 (예: '#EBF5FF')
 * @param {string} hex2 - 끝 색상 (예: '#1565C0')
 * @param {number} t    - 0~1 비율
 * @returns {string} 보간된 hex 색상
 */
function lerpColor(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// 5단계 분류색 팔레트 (낮음 → 높음)
const CLASS_COLORS = {
  samlter:   ['#DDEEFF', '#89B9E0', '#3F88C5', '#1A5FA1', '#0A2E6E'],
  ilter:     ['#FFF3E0', '#FFCC80', '#FFA040', '#E65100', '#8B2E00'],
  shimter:   ['#E8F5E9', '#81C784', '#2E9E4F', '#1B6E2E', '#0A3D12'],
  composite: ['#EEF2F0', '#A8C5BB', '#5C9485', '#2A6B55', '#1B4332'],
};

/**
 * 분위 기반 5-class 구간 계산
 * @param {number[]} values
 * @returns {number[]} 6개 경계값 (breaks[0]~breaks[5])
 */
function getClassBreaks(values) {
  const sorted = [...values].filter(v => v != null).sort((a, b) => a - b);
  if (sorted.length < 2) return [0, 20, 40, 60, 80, 100];
  const n = sorted.length;
  return [
    sorted[0],
    sorted[Math.max(0, Math.floor(n * 0.2))],
    sorted[Math.max(0, Math.floor(n * 0.4))],
    sorted[Math.max(0, Math.floor(n * 0.6))],
    sorted[Math.max(0, Math.floor(n * 0.8))],
    sorted[n - 1],
  ];
}

/**
 * 값을 0~4 클래스 인덱스로 변환
 */
function getClassIndex(value, breaks) {
  for (let i = 0; i < 5; i++) {
    if (value <= breaks[i + 1]) return i;
  }
  return 4;
}

/**
 * 지표값 기반 5단계 분류색 반환
 * @param {number} value
 * @param {number[]} breaks - getClassBreaks() 결과
 * @param {string} category
 * @param {boolean} higherBetter
 * @returns {string} hex 색상
 */
function getColorForValue(value, breaks, category, higherBetter = true) {
  let idx = getClassIndex(value, breaks);
  if (!higherBetter) idx = 4 - idx;
  const colors = CLASS_COLORS[category] || CLASS_COLORS.composite;
  return colors[idx];
}

/**
 * 특정 지표의 전체 시군 값 배열 반환
 * @param {string} indicatorKey - 지표 키 (예: 'L1')
 * @returns {number[]} 값 배열
 */
function getAllValuesForIndicator(indicatorKey) {
  return Object.values(CITIES)
    .map(city => {
      // 공통지표는 city.indicators, 자율지표는 city.jayulIndicators 에서 조회
      if (city.indicators && indicatorKey in city.indicators) return city.indicators[indicatorKey];
      if (city.jayulIndicators && indicatorKey in city.jayulIndicators) return city.jayulIndicators[indicatorKey];
      return undefined;
    })
    .filter(v => v !== undefined && v !== null);
}

/**
 * 지표 min/max 범위 반환
 * @param {string} indicatorKey
 * @returns {{ min: number, max: number }}
 */
function getIndicatorRange(indicatorKey) {
  const values = getAllValuesForIndicator(indicatorKey);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/**
 * 카테고리별 점수 계산 (0~100)
 * @param {string} cityId    - 시군 ID
 * @param {string} category  - 카테고리
 * @returns {number} 0~100 점수
 */
function calcCategoryScore(cityId, category) {
  const city = CITIES[cityId];
  if (!city) return 0;

  // 공통지표 (해당 카테고리만)
  const commonKeys = Object.keys(INDICATORS).filter(k => INDICATORS[k].category === category);

  // + 시군이 선정한 자율지표 (해당 카테고리만) — 농촌다움 종합 점수에 포함
  const selectedJayul = (city.selectedJayulKeys || []).filter(k => {
    const ind = JAYUL_INDICATORS_POOL[k];
    return ind && ind.category === category;
  });

  const allKeys = [...commonKeys, ...selectedJayul];
  if (allKeys.length === 0) return 0;

  const scores = allKeys.map(key => {
    const indicator = INDICATORS[key] || JAYUL_INDICATORS_POOL[key];
    const value     = (city.indicators[key] !== undefined)
                      ? city.indicators[key]
                      : (city.jayulIndicators ? city.jayulIndicators[key] : undefined);
    if (value === undefined || value === null) return 0.5;
    const { min, max } = getIndicatorRange(key);
    let normalized = (value - min) / (max - min + 1e-9);
    normalized = Math.max(0, Math.min(1, normalized));
    return indicator.higherBetter ? normalized : 1 - normalized;
  });

  return (scores.reduce((a, b) => a + b, 0) / scores.length) * 100;
}

/**
 * 종합 점수 계산 (삶터+일터+쉼터 평균)
 * @param {string} cityId
 * @returns {number} 0~100
 */
function calcOverallScore(cityId) {
  const samlter = calcCategoryScore(cityId, 'samlter');
  const ilter   = calcCategoryScore(cityId, 'ilter');
  const shimter  = calcCategoryScore(cityId, 'shimter');
  return (samlter + ilter + shimter) / 3;
}

/**
 * 특정 지표에서 시군의 순위 계산
 * @param {string} cityId        - 시군 ID
 * @param {string} indicatorKey  - 지표 키
 * @returns {number} 순위 (1~15)
 */
function calcRank(cityId, indicatorKey) {
  const indicator = INDICATORS[indicatorKey];
  if (!indicator) return '-';
  const city = CITIES[cityId];
  if (!city || city.indicators[indicatorKey] === undefined) return '-';

  const myValue = city.indicators[indicatorKey];
  const allValues = getAllValuesForIndicator(indicatorKey);
  const sorted = [...allValues].sort((a, b) =>
    indicator.higherBetter ? b - a : a - b
  );
  return sorted.indexOf(myValue) + 1;
}

/**
 * 종합 순위 계산
 * @param {string} cityId
 * @returns {number}
 */
function calcOverallRank(cityId) {
  const myScore = calcOverallScore(cityId);
  const allScores = Object.keys(CITIES).map(id => calcOverallScore(id));
  const sorted = [...allScores].sort((a, b) => b - a);
  return sorted.indexOf(myScore) + 1;
}

/**
 * 숫자 포맷 (소수점 1자리, 정수 여부 판단)
 * @param {number} value
 * @param {string} unit
 * @returns {string}
 */
function formatValue(value, unit) {
  if (value === undefined || value === null) return '-';
  const formatted = Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  return `${formatted}${unit ? ' ' + unit : ''}`;
}

// ===================================================================
// === 로딩 오버레이 ===
// ===================================================================

function showLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'flex';
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

// ===================================================================
// === 지도 초기화 및 마커 관리 ===
// ===================================================================

let map = null;
const markers = {};
let geoJsonLayer = null;
const geoJsonFeatures = {}; // cityId → GeoJSON layer reference
let dongLayer = null;       // 행정동 경계 레이어 (줌 11+ 표시)
let riLayer = null;         // 행정리 경계 레이어 (줌 13+ 표시)
let regionMeta = null;      // KOSIS 캐시 (region-meta.json)
let indicatorReference = null; // 0427 기준 지표 정의/alias
let fieldSurveyMeta = null;    // 현장조사 항목 메타
let dataGapReport = null;      // API/로컬 데이터 누락 상태
let indicatorInsights = null;  // 지표별 시사점·정책 사전 작성 텍스트 (피드백 #3 #5)
let simulationData = null;     // 시뮬레이션 마이크로데이터 (피드백 #7 — namyangju 읍면 mock)
let aiInterpretations = null;  // AI 해석용 사전 작성 텍스트 (피드백 #5 — 정적 텍스트)
let fieldSurveyData = null;    // 현장조사 가상데이터 집계 (0531 — namyangju 9읍면 실데이터형, CANON 키)
let triggerConfig = null;      // 트리거→시사점 카드 엔진 + THE비전/SWOT (0531 — namyangju-triggers.json)
let labelGroup = null;      // 시군명 라벨 레이어
let outlineLayer = null;    // 대상지(15개 시군) 합쳐진 외곽선 효과 레이어
let sigunBorderLayer = null; // 시군 경계선 전용 오버레이 (dong/ri 위에 항상 표시)
const DONG_ZOOM_THRESHOLD = 11;
const RI_ZOOM_THRESHOLD   = 13;

// ===================================================================
// === 베이스맵 비교 (basemap-compare 브랜치 전용) ===
// ===================================================================
const BASEMAPS = {
  voyager: {
    name: 'A. Voyager (현재)',
    layers: [{ url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', sub: 'abcd' }],
    attr: '© OSM, © CARTO',
  },
  positron: {
    name: 'B. Positron (미니멀 회색조)',
    layers: [{ url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', sub: 'abcd' }],
    attr: '© OSM, © CARTO',
  },
  positronLabeled: {
    name: 'C. Positron + 라벨 위쪽',
    layers: [
      { url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', sub: 'abcd' },
      { url: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', sub: 'abcd', isOverlay: true },
    ],
    attr: '© OSM, © CARTO',
  },
  dark: {
    name: 'D. Dark Matter (다크)',
    layers: [{ url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', sub: 'abcd' }],
    attr: '© OSM, © CARTO',
  },
  osm: {
    name: 'E. OpenStreetMap 기본',
    // OSM 공식: 서브도메인 없는 단일 도메인이 현재 권장 방식
    layers: [{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', sub: '' }],
    attr: '© OpenStreetMap contributors',
  },
  esriTopo: {
    name: 'F. Esri World Topographic',
    layers: [{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', sub: '' }],
    attr: 'Tiles © Esri',
  },
  esri: {
    name: 'G. Esri Light Gray Canvas',
    layers: [{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', sub: '' }],
    attr: 'Tiles © Esri',
  },
  esriSat: {
    name: 'H. Esri 위성 (Imagery)',
    layers: [{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', sub: '' }],
    attr: 'Tiles © Esri',
  },
};

// 다크 테마 베이스맵 키 — 선택 시 #map 배경도 어둡게
const DARK_BASEMAPS = new Set(['dark', 'esriSat']);

let currentBasemapLayers = [];

function setBasemap(key) {
  const cfg = BASEMAPS[key];
  if (!cfg) return;
  // 기존 베이스맵 제거
  currentBasemapLayers.forEach(l => map.removeLayer(l));
  currentBasemapLayers = [];
  // 새 베이스맵 추가
  cfg.layers.forEach(layer => {
    const opts = { attribution: cfg.attr, maxZoom: 19 };
    if (layer.sub) opts.subdomains = layer.sub;
    const tile = L.tileLayer(layer.url, opts);
    tile.addTo(map);
    if (!layer.isOverlay) tile.bringToBack();
    currentBasemapLayers.push(tile);
  });
  // 다크 베이스맵일 때 클래스 토글 — #map 및 leaflet 내부 컨테이너까지 어둡게
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.classList.toggle('basemap-is-dark', DARK_BASEMAPS.has(key));
  }
  try { localStorage.setItem('basemap_choice', key); } catch (e) {}
}

function initBasemapSwitcher() {
  const saved = (() => { try { return localStorage.getItem('basemap_choice'); } catch (e) { return null; } })();
  const initialKey = saved && BASEMAPS[saved] ? saved : 'positron';
  setBasemap(initialKey);

  // 우상단 토글 UI 생성
  const ctrl = L.control({ position: 'topright' });
  ctrl.onAdd = function () {
    const div = L.DomUtil.create('div', 'basemap-switcher');
    div.innerHTML = `
      <div class="basemap-switcher-label">🗺️ 베이스맵 선택</div>
      <select id="basemap-select"></select>
    `;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  ctrl.addTo(map);

  const sel = document.getElementById('basemap-select');
  Object.entries(BASEMAPS).forEach(([key, cfg]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = cfg.name;
    if (key === initialKey) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', (e) => setBasemap(e.target.value));
}

/**
 * Leaflet 지도 초기화 및 시군 마커 생성
 */
function initMap() {
  // 경기도 주변 영역으로 줌/패닝 제한
  const GYEONGGI_BOUNDS = L.latLngBounds(
    L.latLng(36.8, 125.8),   // 남서 (충남 경계 부근)
    L.latLng(38.5, 128.5)    // 북동 (강원 경계 부근)
  );

  map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: false,
    minZoom: 8,                       // 경기도 전체가 보이는 최소 줌
    maxBounds: GYEONGGI_BOUNDS,       // 패닝 영역 제한
    maxBoundsViscosity: 0.85,         // 경계 저항감 (0=없음, 1=완전 고정)
  }).setView([37.55, 127.2], 9);

  // ── 베이스맵 비교 모드 ──
  // 7개 옵션 + 토글 UI. 우상단 드롭다운에서 실시간 전환.
  initBasemapSwitcher();

  // 레이아웃 완료 후 타일 크기 재계산 (숨겨진 컨테이너에서 초기화된 경우 대비)
  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 100);
  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 500);

  // 각 시군 CircleMarker 생성
  Object.values(CITIES).forEach(city => {
    const color = getCityColor(city.id);
    const marker = L.circleMarker([city.lat, city.lng], {
      radius: 18,
      fillColor: color,
      color: '#fff',
      weight: 2,
      opacity: 0.9,
      fillOpacity: 0.75,
    }).addTo(map);

    // 툴팁 (호버 시 표시)
    const tooltipContent = buildTooltipContent(city.id);
    marker.bindTooltip(tooltipContent, {
      permanent: false,
      direction: 'top',
      offset: [0, -10],
      className: 'city-tooltip',
    });

    // 클릭 이벤트
    marker.on('click', () => selectCity(city.id));

    markers[city.id] = marker;
  });

  // 지도 indicator 선택 드롭다운 초기화
  initIndicatorSelector();
  updateMapColors();

  // GeoJSON 폴리곤 레이어 비동기 로드 (성공 시 CircleMarker 대체)
  initGeoJSONLayer();

  // 행정동 경계 레이어 비동기 로드
  initDongLayer();

  // 행정리 경계 레이어 비동기 로드 (있을 때만)
  initRiLayer();

  // KOSIS 메타정보 캐시 로드 (있을 때만)
  loadRegionMeta();

  // 줌 변경 시 행정동·행정리 가시성 + 라벨 크기 + HUD 업데이트
  map.on('zoomend', () => {
    updateDongVisibility();
    updateRiVisibility();
    updateCityLabelSize();
    updateMapContextHud();
  });

  // 지도 이동 시 HUD 업데이트 (어느 시군·읍면을 보고 있는지 갱신)
  map.on('moveend', () => {
    updateMapContextHud();
  });
}

/**
 * 행정리 경계 레이어 초기화 (줌 13+ 에서만 표시) — graceful: 파일 없으면 silent
 */
async function initRiLayer() {
  try {
    const resp = await fetch('./dat/gyeonggi-ri.geojson');
    if (!resp.ok) {
      console.info('[GeoJSON] 행정리 파일 없음 — 드릴다운 2단계만 사용');
      return;
    }
    const data = await resp.json();

    riLayer = L.geoJSON(data, {
      style: {
        fillColor: 'transparent',
        color: 'rgba(74, 144, 217, 0.55)',
        weight: 0.6,
        fillOpacity: 0,
        dashArray: '2,2',
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const name = p.ri_nm || '';
        layer.bindTooltip(name, {
          permanent: true, direction: 'center', className: 'ri-label-permanent',
        });
        layer.on('mouseover', function () {
          if (state.selectedRi !== p.ri_cd) {
            this.setStyle({ color: '#4A90D9', weight: 1.6, fillColor: '#4A90D9', fillOpacity: 0.08, dashArray: null });
          }
        });
        layer.on('mouseout', function () {
          if (state.selectedRi !== p.ri_cd) {
            this.setStyle({ color: 'rgba(74, 144, 217, 0.55)', weight: 0.6, fillColor: 'transparent', fillOpacity: 0, dashArray: '2,2' });
          }
        });
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectRi(p.ri_cd, p.ri_nm, p.dong_cd, p.city_id, layer);
        });
      },
    });
    updateRiVisibility();
  } catch (err) {
    console.info('[GeoJSON] 행정리 로드 실패 (정상 — 데이터 없음 가능):', err.message);
  }
}

/**
 * 현재 줌 레벨에 따라 행정리 레이어 표시/숨김
 */
function updateRiVisibility() {
  if (!map || !riLayer) return;
  const zoom = map.getZoom();
  if (zoom >= RI_ZOOM_THRESHOLD) {
    if (!map.hasLayer(riLayer)) riLayer.addTo(map);
    // riLayer를 dong 위에 유지 → 클릭이 ri에 먼저 도달 (dong 클릭 차단 방지)
    riLayer.bringToFront();
    // 시군 경계선은 non-interactive로 최상위 (클릭 통과)
    if (sigunBorderLayer) sigunBorderLayer.bringToFront();
  } else {
    if (map.hasLayer(riLayer)) map.removeLayer(riLayer);
    if (sigunBorderLayer && dongLayer && map.hasLayer(dongLayer)) sigunBorderLayer.bringToFront();
  }
}

/**
 * KOSIS 메타정보 JSON 캐시 로드 (없으면 빈 객체)
 */
async function loadRegionMeta() {
  try {
    const [metaResp, refResp, surveyResp, gapResp, insightsResp, simResp, aiResp, fieldResp, trigResp] = await Promise.all([
      fetch('./dat/region-meta.json', { cache: 'no-cache' }),
      fetch('./dat/indicator-reference.json', { cache: 'no-cache' }),
      fetch('./dat/field-survey-meta.json', { cache: 'no-cache' }),
      fetch('./dat/data-gap-report.json', { cache: 'no-cache' }),
      fetch('./dat/indicator-insights.json', { cache: 'no-cache' }),
      fetch('./dat/simulation/namyangju-dong-mock.json', { cache: 'no-cache' }),
      fetch('./dat/ai-interpretations.json', { cache: 'no-cache' }),
      fetch('./dat/simulation/namyangju-field-survey.json', { cache: 'no-cache' }),
      fetch('./dat/namyangju-triggers.json', { cache: 'no-cache' }),
    ]);
    regionMeta = metaResp.ok ? await metaResp.json() : {};
    indicatorReference = refResp.ok ? await refResp.json() : null;
    fieldSurveyMeta = surveyResp.ok ? await surveyResp.json() : null;
    dataGapReport = gapResp.ok ? await gapResp.json() : null;
    indicatorInsights = insightsResp.ok ? await insightsResp.json() : null;
    simulationData = simResp.ok ? await simResp.json() : null;
    aiInterpretations = aiResp.ok ? await aiResp.json() : null;
    fieldSurveyData = fieldResp.ok ? await fieldResp.json() : null;
    triggerConfig = trigResp.ok ? await trigResp.json() : null;
  } catch (err) {
    regionMeta = {};
    indicatorReference = null;
    fieldSurveyMeta = null;
    dataGapReport = null;
    indicatorInsights = null;
    simulationData = null;
    aiInterpretations = null;
    fieldSurveyData = null;
    triggerConfig = null;
  }
  // SGIS computed 값으로 CITIES mock 덮어쓰기 (실측 우선)
  applySgisOverridesToCities();
  updateMapColors();
  updateLegend();
  if (state.selectedCity) {
    updateDetailPanel(state.selectedCity);
    updateRadarChart(state.selectedCity);
    updateIndicatorList();
  }
}

/**
 * region-meta.json 의 computed/raw 값으로 CITIES mock 값을 덮어씀.
 *
 * SGIS·KOSIS 실측이 있는 지표는 mock 값 대신 실측 사용 → 표·차트·지도 색상
 * 모두 같은 출처로 일관됨. SCORE_SOURCE_OVERRIDES에 없는 지표는 mock 유지.
 *
 * 매핑 목록은 파일 상단 SCORE_SOURCE_OVERRIDES에서 고정한다.
 */
function applySgisOverridesToCities() {
  if (!regionMeta || !regionMeta.sigun || typeof CITIES === 'undefined') return;
  let overriddenCount = 0;

  const readOverrideValue = (meta, cfg) => {
    if (!meta || !cfg) return undefined;
    const layer = meta[cfg.layer] || {};
    const rec = layer[cfg.key];
    return rec && rec.value != null ? rec.value : undefined;
  };
  const normalizeScoreValue = (value) => (
    typeof value === 'number' ? Math.round(value * 100) / 100 : value
  );

  Object.entries(regionMeta.sigun).forEach(([cid, data]) => {
    const city = CITIES[cid];
    if (!city || !data) return;

    // 공통지표 (indicators) 덮어쓰기
    Object.entries(SCORE_SOURCE_OVERRIDES.common).forEach(([indKey, cfg]) => {
      const value = readOverrideValue(data, cfg);
      if (value !== undefined && city.indicators) {
        city.indicators[indKey] = normalizeScoreValue(value);
        overriddenCount++;
      }
    });

    // 자율지표 (jayulIndicators) 덮어쓰기
    Object.entries(SCORE_SOURCE_OVERRIDES.jayul).forEach(([indKey, cfg]) => {
      const value = readOverrideValue(data, cfg);
      if (value !== undefined && city.jayulIndicators) {
        city.jayulIndicators[indKey] = normalizeScoreValue(value);
        overriddenCount++;
      }
    });
  });

  // 캐시된 5분위 quantile 등이 있으면 무효화 가능 — 이번엔 별도 캐시 없음
  if (overriddenCount > 0) {
    const mappedKeys = [
      ...Object.keys(SCORE_SOURCE_OVERRIDES.common),
      ...Object.keys(SCORE_SOURCE_OVERRIDES.jayul),
    ].join(', ');
    console.log(`[CITIES override] 실제/수동 데이터로 ${overriddenCount}개 필드 덮어씀 (${mappedKeys})`);
  }
}

function readRegionRecord(level, regionId, layer, key) {
  const meta = regionMeta && regionMeta[level] && regionMeta[level][regionId];
  if (!meta || !meta[layer]) return null;
  return meta[layer][key] || null;
}

function getIndicatorOverrideConfig(key) {
  if (SCORE_SOURCE_OVERRIDES.common[key]) return SCORE_SOURCE_OVERRIDES.common[key];
  if (SCORE_SOURCE_OVERRIDES.jayul[key]) return SCORE_SOURCE_OVERRIDES.jayul[key];
  return null;
}

function getGapItem(key) {
  const items = (dataGapReport && dataGapReport.items) || [];
  return items.find(item => item.indicator === key) || null;
}

function getIndicatorDataStatus(cityId, key) {
  const cfg = getIndicatorOverrideConfig(key);
  if (cfg) {
    const rec = readRegionRecord('sigun', cityId, cfg.layer, cfg.key);
    if (rec && rec.value != null) {
      const source = String(rec.source || '');
      if (source.startsWith('local0427:')) return { label: '0427 확정', cls: 'status-local' };
      if (source.startsWith('kosis:')) return { label: 'KOSIS', cls: 'status-kosis' };
      if (source.startsWith('sgis:')) return { label: 'SGIS', cls: 'status-sgis' };
      if (cfg.layer === 'computed') return { label: '계산', cls: 'status-computed' };
      if (cfg.layer === 'manual') return { label: '수동', cls: 'status-manual' };
    }
  }

  const gap = getGapItem(key);
  if (gap) {
    const labelMap = {
      field_survey: '현장조사 필요',
      local_parse_failed: '원천 재확인',
      not_available: 'API 미제공',
      not_collected: '미수집',
      local_only: '로컬 원천',
      partial: '일부 확보',
    };
    return {
      label: labelMap[gap.status] || gap.status || '미수집',
      cls: `status-${gap.status || 'missing'}`,
      title: gap.reason || '',
    };
  }

  return { label: '예시값', cls: 'status-mock' };
}

function renderStatusBadge(status) {
  if (!status) return '';
  const title = status.title ? ` title="${status.title}"` : '';
  return `<span class="data-status-badge ${status.cls}"${title}>${status.label}</span>`;
}

/**
 * 행정동 경계 레이어 초기화 (줌 11+ 에서만 표시)
 */
async function initDongLayer() {
  try {
    const resp = await fetch('./dat/gyeonggi-dong.geojson');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    dongLayer = L.geoJSON(data, {
      style: {
        fillColor: 'transparent',
        color: 'rgba(40,40,40,0.4)',
        weight: 0.7,
        fillOpacity: 0,
        dashArray: '3,2',
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const name = p.adm_nm || '';
        layer.bindTooltip(name, {
          permanent: true, direction: 'center', className: 'dong-label-permanent',
        });
        // 호버 강조 — 선택된 읍면은 제외
        layer.on('mouseover', function () {
          if (state.selectedDong !== p.adm_cd) {
            this.setStyle({ color: '#2D5F3F', weight: 1.8, fillColor: '#2D5F3F', fillOpacity: 0.06, dashArray: null });
          }
        });
        layer.on('mouseout', function () {
          if (state.selectedDong !== p.adm_cd) {
            this.setStyle({ color: 'rgba(40,40,40,0.4)', weight: 0.7, fillColor: 'transparent', fillOpacity: 0, dashArray: '3,2' });
          }
        });
        // 클릭 → 읍면 선택
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectDong(p.adm_cd, p.adm_nm, p.city_id);
        });
      },
    });
    // 초기 줌에 따라 표시 여부 결정
    updateDongVisibility();
  } catch (err) {
    console.warn('[GeoJSON] 행정동 로드 실패:', err.message);
  }
}

/**
 * 현재 줌 레벨에 따라 행정동 레이어 표시/숨김
 */
function updateDongVisibility() {
  if (!map || !dongLayer) return;
  const zoom = map.getZoom();
  if (zoom >= DONG_ZOOM_THRESHOLD) {
    if (!map.hasLayer(dongLayer)) dongLayer.addTo(map);
    // 시군 경계선이 읍면 위에 항상 최상위로 유지
    if (sigunBorderLayer) sigunBorderLayer.bringToFront();
  } else {
    if (map.hasLayer(dongLayer)) map.removeLayer(dongLayer);
  }
}

/**
 * 경기도 시군 GeoJSON 폴리곤 레이어 초기화 (비동기)
 * southkorea-maps 공개 데이터 → 실패 시 CircleMarker 유지
 */
async function initGeoJSONLayer() {
  const GEOJSON_URL = './dat/gyeonggi-sigun.geojson';

  try {
    const resp = await fetch(GEOJSON_URL, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const allData = await resp.json();

    // id 프로퍼티로 직접 매칭 (GeoJSON properties.id = cityId)
    const validIds = new Set(Object.keys(CITIES));

    // 알려진 cityId가 있는 피처만 사용
    const features = allData.features.filter(f => validIds.has(f.properties.id));

    if (features.length === 0) throw new Error('매칭 피처 없음');

    // CircleMarker 제거
    Object.values(markers).forEach(m => map.removeLayer(m));

    // ── 합쳐진 외곽선 효과 (먼저 추가 → 컬러 폴리곤 아래에 렌더) ──
    // 같은 폴리곤을 두꺼운 어두운 테두리로 그리면, 위 컬러 레이어가 내부를 덮어
    // 외곽으로 삐져나온 부분만 남아 자연스러운 합쳐진 외곽선이 됨
    if (outlineLayer) map.removeLayer(outlineLayer);
    outlineLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: {
        fillColor: '#1a2e1a',
        fillOpacity: 1,
        color: '#1a2e1a',
        weight: 6,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
        interactive: false,
      },
    }).addTo(map);

    geoJsonLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: (feature) => {
        const cityId = feature.properties.id;
        return {
          fillColor: cityId ? getCityColor(cityId) : '#ccc',
          color: '#ffffff',   // 흰색 경계선
          weight: 1.2,        // 시군 간 경계는 얇게 (외곽선이 강조됨)
          opacity: 1,
          fillOpacity: 0.92,  // 채도/대비 강화 → 배경 위에서 자연스럽게 도드라짐
        };
      },
      onEachFeature: (feature, layer) => {
        const cityId = feature.properties.id;
        if (!cityId) return;

        geoJsonFeatures[cityId] = layer;

        layer.on('click', () => selectCity(cityId));
        layer.on('mouseover', function (e) {
          if (state.selectedCity !== cityId) {
            this.setStyle({ weight: 2.5, color: '#FF6B35', fillOpacity: 0.9 });
          }
          this.bindTooltip(buildTooltipContent(cityId), {
            permanent: false, direction: 'top', className: 'city-tooltip',
          }).openTooltip(e.latlng);
        });
        layer.on('mouseout', function () {
          if (state.selectedCity !== cityId) {
            const color = getCityColor(cityId);
            this.setStyle({ fillColor: color, color: '#ffffff', weight: 1.2, fillOpacity: 0.92 });
          }
          this.closeTooltip();
        });
      },
    }).addTo(map);

    // ── 시군 경계선 오버레이 (경계선만, 채우기 없음) ──
    // dong/ri 레이어가 추가되어도 시군 경계가 항상 최상위에 표시되도록
    if (sigunBorderLayer) map.removeLayer(sigunBorderLayer);
    sigunBorderLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
      interactive: false, // 마우스 이벤트 차단 — 하위 레이어로 클릭 통과
      style: {
        fillColor: 'transparent',
        fillOpacity: 0,
        color: 'rgba(20, 35, 25, 0.50)',
        weight: 2.0,
        opacity: 1,
      },
    }).addTo(map);

    map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] });
    updateMapColors();
    initCityLabels(); // 폴리곤 로드 완료 후 라벨 생성

  } catch (err) {
    console.warn('[GeoJSON] 폴리곤 로드 실패 — CircleMarker 유지:', err.message);
  }
}

/**
 * 폴리곤 시각적 무게중심 계산 (Shoelace 공식)
 * getBounds().getCenter() 보다 정확한 폴리곤 내부 중심점 반환
 */
function computePolygonCentroid(layer) {
  try {
    const geom = layer.feature && layer.feature.geometry;
    if (!geom) return layer.getBounds().getCenter();

    let ring = null;

    if (geom.type === 'Polygon') {
      ring = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon') {
      // 면적이 가장 큰 폴리곤 선택
      let maxArea = 0;
      geom.coordinates.forEach(poly => {
        const r = poly[0];
        const lngs = r.map(c => c[0]);
        const lats  = r.map(c => c[1]);
        const bbox  = (Math.max(...lngs) - Math.min(...lngs)) *
                      (Math.max(...lats) - Math.min(...lats));
        if (bbox > maxArea) { maxArea = bbox; ring = r; }
      });
    }

    if (!ring || ring.length < 3) return layer.getBounds().getCenter();

    // Shoelace 무게중심 (GeoJSON 좌표: [lng, lat])
    let A = 0, cx = 0, cy = 0;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const f = xi * yj - xj * yi;
      A  += f;
      cx += (xi + xj) * f;
      cy += (yi + yj) * f;
    }
    A /= 2;
    if (Math.abs(A) < 1e-12) return layer.getBounds().getCenter();
    return L.latLng(cy / (6 * A), cx / (6 * A)); // (lat, lng)
  } catch (_) {
    return layer.getBounds().getCenter();
  }
}

/**
 * 시군명 라벨 레이어 생성 (DivIcon, 폴리곤과 독립적으로 동작)
 */
function initCityLabels() {
  if (!map) return;
  if (labelGroup) { map.removeLayer(labelGroup); }

  labelGroup = L.layerGroup().addTo(map);

  Object.entries(geoJsonFeatures).forEach(([cityId, layer]) => {
    const cityName = CITIES[cityId] ? CITIES[cityId].name : cityId;
    const center = computePolygonCentroid(layer); // ← 정확한 무게중심

    const marker = L.marker(center, {
      icon: L.divIcon({
        className: 'city-label-marker',
        html: `<span class="city-label-text">${cityName}</span>`,
        iconSize:   [0, 0],
        iconAnchor: [0, 0],
      }),
      interactive: false,
      zIndexOffset: -500,
    });

    labelGroup.addLayer(marker);
  });

  updateCityLabelSize();
}

/**
 * 줌 레벨에 따라 지도 컨테이너 클래스 변경 → CSS로 라벨 크기 제어
 */
function updateCityLabelSize() {
  const container = document.getElementById('map');
  if (!container || !map) return;
  const z = Math.round(map.getZoom());
  container.className = container.className
    .replace(/\bmap-zoom-\d+\b/g, '').trim();
  container.classList.add('map-zoom-' + Math.min(13, Math.max(7, z)));
}

/**
 * 시군 색상 반환 (현재 활성 지표 기준)
 * @param {string} cityId
 * @returns {string} hex 색상
 */
function getCityColor(cityId) {
  const city = CITIES[cityId];
  if (!city) return '#999';

  const indicatorKey = state.activeIndicator;

  if (indicatorKey === 'total') {
    const allScores = Object.keys(CITIES).map(id => calcOverallScore(id));
    const breaks = getClassBreaks(allScores);
    const score = calcOverallScore(cityId);
    return getColorForValue(score, breaks, 'composite', true);
  }

  if (CATEGORY_TOTALS[indicatorKey]) {
    const cat = CATEGORY_TOTALS[indicatorKey].category;
    const allScores = Object.keys(CITIES).map(id => calcCategoryScore(id, cat));
    const breaks = getClassBreaks(allScores);
    const score = calcCategoryScore(cityId, cat);
    return getColorForValue(score, breaks, cat, true);
  }

  const indicator = INDICATORS[indicatorKey];
  if (!indicator) return '#999';

  const value = city.indicators[indicatorKey];
  if (value === undefined || value === null) return '#ccc';

  const allValues = getAllValuesForIndicator(indicatorKey);
  const breaks = getClassBreaks(allValues);
  return getColorForValue(value, breaks, indicator.category, indicator.higherBetter);
}

/**
 * 툴팁 HTML 생성
 * @param {string} cityId
 * @returns {string}
 */
function buildTooltipContent(cityId) {
  const city = CITIES[cityId];
  if (!city) return '';

  const indicatorKey = state.activeIndicator;
  const score = calcOverallScore(cityId).toFixed(1);

  let indicatorLine;
  if (indicatorKey === 'total') {
    indicatorLine = `<div style="font-size: 12px; color: #1B4332; font-weight: 600;">종합점수: ${score}점</div>`;
  } else if (CATEGORY_TOTALS[indicatorKey]) {
    const { category, label } = CATEGORY_TOTALS[indicatorKey];
    const catScore = calcCategoryScore(cityId, category).toFixed(1);
    indicatorLine = `
      <div style="font-size: 12px; color: #1B4332; font-weight: 600;">${label}: ${catScore}점</div>
      <div style="font-size: 11px; color: #777;">종합점수: ${score}점</div>`;
  } else {
    const indicator = INDICATORS[indicatorKey];
    const value = city.indicators[indicatorKey];
    indicatorLine = `
      <div style="font-size: 11px; color: #555;">${indicator ? indicator.name : indicatorKey}: ${formatValue(value, indicator ? indicator.unit : '')}</div>
      <div style="font-size: 11px; color: #777;">종합점수: ${score}점</div>`;
  }

  return `
    <div style="font-family: 'Pretendard', sans-serif; min-width: 140px;">
      <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px;">${city.name}</div>
      ${indicatorLine}
    </div>
  `;
}

/**
 * 지도 마커 색상 전체 업데이트
 */
function updateMapColors() {
  if (Object.keys(geoJsonFeatures).length > 0) {
    // GeoJSON 폴리곤 모드
    Object.entries(geoJsonFeatures).forEach(([cityId, layer]) => {
      const color = getCityColor(cityId);
      const isSelected = state.selectedCity === cityId;
      layer.setStyle({
        fillColor: color,
        color: isSelected ? '#FF6B35' : '#fff',
        weight: isSelected ? 3 : 1.5,
        fillOpacity: isSelected ? 0.92 : 0.78,
      });
      layer.unbindTooltip();
      layer.bindTooltip(buildTooltipContent(cityId), {
        permanent: false, direction: 'top', className: 'city-tooltip',
      });
      if (isSelected) layer.bringToFront();
    });
  } else {
    // CircleMarker 폴백
    Object.keys(CITIES).forEach(cityId => {
      const marker = markers[cityId];
      if (!marker) return;
      const color = getCityColor(cityId);
      const isSelected = state.selectedCity === cityId;
      marker.setStyle({
        fillColor: color,
        color: isSelected ? '#FF6B35' : '#fff',
        weight: isSelected ? 3 : 2,
      });
      marker.setRadius(isSelected ? 22 : 18);
      marker.unbindTooltip();
      marker.bindTooltip(buildTooltipContent(cityId), {
        permanent: false, direction: 'top', offset: [0, -10], className: 'city-tooltip',
      });
    });
  }
}

/**
 * 선택된 시군 마커 강조
 * @param {string} cityId
 */
function highlightMarker(cityId) {
  if (Object.keys(geoJsonFeatures).length > 0) {
    Object.entries(geoJsonFeatures).forEach(([id, layer]) => {
      const color = getCityColor(id);
      if (id === cityId) {
        layer.setStyle({ fillColor: color, color: '#FF6B35', weight: 3, fillOpacity: 0.92 });
        layer.bringToFront();
      } else {
        layer.setStyle({ fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.82 });
      }
    });
  } else {
    Object.keys(markers).forEach(id => {
      const marker = markers[id];
      const color = getCityColor(id);
      if (id === cityId) {
        marker.setStyle({ fillColor: color, color: '#FF6B35', weight: 3.5, fillOpacity: 0.9 });
        marker.setRadius(24);
      } else {
        marker.setStyle({ fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.75 });
        marker.setRadius(18);
      }
    });
  }
}

/**
 * 지도 지표 선택 드롭다운 초기화
 */
function initIndicatorSelector() {
  const selector = document.getElementById('indicator-selector');
  if (!selector) return;

  selector.innerHTML = '';

  // 종합점수 옵션 (첫 번째)
  const totalOpt = document.createElement('option');
  totalOpt.value = 'total';
  totalOpt.textContent = '★ 종합점수';
  if (state.activeIndicator === 'total') totalOpt.selected = true;
  selector.appendChild(totalOpt);

  // 카테고리별 optgroup
  const groups = {
    samlter: { label: '삶터 지표', catTotalKey: 'samlter_total', keys: [] },
    ilter:   { label: '일터 지표', catTotalKey: 'ilter_total',   keys: [] },
    shimter:  { label: '쉼터 지표', catTotalKey: 'shimter_total',  keys: [] },
  };
  Object.entries(INDICATORS).forEach(([key, ind]) => {
    if (groups[ind.category]) groups[ind.category].keys.push(key);
  });

  Object.entries(groups).forEach(([catKey, group]) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;

    // 카테고리 종합 옵션 (맨 앞)
    const totalOpt = document.createElement('option');
    totalOpt.value = group.catTotalKey;
    totalOpt.textContent = `◆ ${CATEGORY_TOTALS[group.catTotalKey].label}`;
    if (group.catTotalKey === state.activeIndicator) totalOpt.selected = true;
    optgroup.appendChild(totalOpt);

    group.keys.forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${key} - ${INDICATORS[key].name}`;
      if (key === state.activeIndicator) opt.selected = true;
      optgroup.appendChild(opt);
    });
    selector.appendChild(optgroup);
  });

  selector.addEventListener('change', () => {
    state.activeIndicator = selector.value;
    updateMapColors();
    updateLegend();
  });
}

// ===================================================================
// === 시군 선택 및 상세 패널 ===
// ===================================================================

/**
 * 시군 선택 처리
 * @param {string} cityId
 */
function selectCity(cityId) {
  if (!CITIES[cityId]) return;

  state.selectedCity = cityId;

  // 새 시군 선택 시 읍면 선택 자동 해제
  if (typeof clearDongSelection === 'function') clearDongSelection({ skipBreadcrumb: true });

  // 안내 메시지 숨김, 상세 뷰 표시
  const noMsg = document.getElementById('no-selection-msg');
  if (noMsg) noMsg.style.display = 'none';

  const cityDetail = document.getElementById('city-detail');
  if (cityDetail) cityDetail.classList.remove('hidden');

  updateDetailPanel(cityId);
  updateRadarChart(cityId);
  highlightMarker(cityId);
  updateIndicatorList();

  // 지역 경로 breadcrumb 렌더
  if (typeof renderRegionBreadcrumb === 'function') renderRegionBreadcrumb();

  // 선택 토스트 + HUD 업데이트
  const cityNameForToast = CITIES[cityId] ? CITIES[cityId].name : cityId;
  showMapSelectToast('🏙️', cityNameForToast, '시군');
  updateMapContextHud();

  // 지도 이동
  if (map) {
    const city = CITIES[cityId];
    map.setView([city.lat, city.lng], 10, { animate: true, duration: 0.5 });
  }
}

/**
 * 상세 패널 업데이트
 * @param {string} cityId
 */
function updateDetailPanel(cityId) {
  const city = CITIES[cityId];
  if (!city) return;

  // 시군명 업데이트
  const titleEl = document.getElementById('city-title');
  if (titleEl) titleEl.textContent = city.name;

  // 유형 뱃지
  const badgeEl = document.getElementById('city-type-badge');
  if (badgeEl) {
    badgeEl.textContent = city.type || '시군';
    badgeEl.className = `city-type-badge type-${cityId === 'namyangju' ? 'special' : 'normal'}`;
  }

  // 히어로 종합점수 / 순위 업데이트
  const totalScoreEl = document.getElementById('city-total-score');
  if (totalScoreEl) totalScoreEl.textContent = calcOverallScore(cityId).toFixed(1);

  const rankBadgeEl = document.getElementById('city-rank-badge');
  if (rankBadgeEl) rankBadgeEl.textContent = `경기도 ${calcOverallRank(cityId)}위`;

  // 점수 카드 업데이트
  updateScoreCards(cityId);

  // 시사점·정책 제안 섹션 (피드백 #3 #5)
  renderInsightCard(cityId);

  // AI 해석 카드 (피드백 #5) — 시군 단위 사전 작성 텍스트
  renderAiInterpretationCard(cityId);

  // 관리자 편집 패널 (피드백 #6) — view-admin 모드일 때만 표시
  renderAdminEditPanel(cityId);

  // 비교 추가 버튼
  updateComparisonButton(cityId);

  // 남양주 자율지표 섹션
  updateJayulSection(cityId);

  // 남양주 읍면 비교 섹션 (피드백 #2 #7) — namyangju 만 표시
  renderDongComparison(cityId);

  // KOSIS 시군 기본 통계 섹션
  renderKosisSigunStats(cityId);

  // 현장조사 입력/관리 섹션
  renderFieldSurveySection(cityId);
}

/**
 * 시군별 시사점 카드 렌더 — "그래서 어떻게?" 답변 (피드백 #3 #5)
 * - 권역 요약 (도농전환형 등)
 * - 선정된 자율지표 중 등급별 시사점 (high/mid/low 자동 매칭)
 */
function renderInsightCard(cityId) {
  // 기존 카드 제거 (시군 전환 시 재렌더)
  const existing = document.getElementById('sigun-insight-card');
  if (existing) existing.remove();

  if (!indicatorInsights) return;
  const city = CITIES[cityId];
  if (!city) return;

  const zoneInsight = getZoneInsight(cityId);

  // 시군의 선정 자율지표 중 인사이트가 있는 것 모음 (최대 3개 — 정보 과부하 방지)
  const selectedKeys = (city.selectedJayulKeys || []).filter(k => indicatorInsights.indicators[k]);
  const insightsForCity = selectedKeys.slice(0, 3).map(key => {
    const meta = JAYUL_INDICATORS_POOL[key] || INDICATORS[key];
    const insight = getIndicatorInsight(cityId, key);
    return { key, name: meta?.name || key, insight };
  }).filter(x => x.insight && x.insight.tierText);

  // 카드 구성
  const card = document.createElement('section');
  card.id = 'sigun-insight-card';
  card.className = 'insight-card';
  card.setAttribute('aria-label', `${city.name} 시사점 및 정책 제안`);

  let html = '';
  if (zoneInsight) {
    html += `
      <header class="insight-card-header">
        <span class="insight-emoji" aria-hidden="true">💡</span>
        <div class="insight-header-text">
          <h3>${city.name}의 농촌다움 시사점</h3>
          <p class="insight-zone-label"><strong>${zoneInsight.label}</strong> · ${zoneInsight.summary}</p>
        </div>
      </header>`;
  }

  if (insightsForCity.length > 0) {
    html += '<div class="insight-list">';
    insightsForCity.forEach(item => {
      const tierClass = item.insight.tier ? `insight-tier-${item.insight.tier}` : '';
      const tierLabel = { high: '강점', mid: '평균', low: '보강 필요' }[item.insight.tier] || '';
      html += `
        <article class="insight-item ${tierClass}" data-key="${item.key}">
          <header class="insight-item-header">
            <span class="insight-item-key">${item.key}</span>
            <span class="insight-item-name">${item.name}</span>
            ${tierLabel ? `<span class="insight-item-tier">${tierLabel}</span>` : ''}
          </header>
          <p class="insight-item-text">${item.insight.tierText}</p>
        </article>`;
    });
    html += '</div>';
  } else {
    html += `<p class="insight-empty-note">자율지표 선정·등급 산정이 완료되면 여기에 정책 제언이 표시됩니다.</p>`;
  }

  // 안내 푸터
  html += `
    <footer class="insight-card-footer">
      <small>💬 해석 텍스트는 보고서 기반의 사전 작성 가이드입니다. 향후 LLM 동적 분석으로 확장 예정.</small>
    </footer>`;

  card.innerHTML = html;

  // 점수 카드 다음에 삽입
  const scoreCards = document.getElementById('score-cards');
  const cityDetail = document.getElementById('city-detail');
  if (scoreCards && scoreCards.parentNode) {
    scoreCards.parentNode.insertBefore(card, scoreCards.nextSibling);
  } else if (cityDetail) {
    cityDetail.appendChild(card);
  }
}

/**
 * AI 해석 카드 렌더 — 시군별 강점·약점·정책 권고 (피드백 #5)
 * 본 텍스트는 사전 작성된 가이드입니다. 향후 LLM 동적 분석으로 대체 예정.
 *
 * 위치: 시사점 카드(`#sigun-insight-card`) 다음에 삽입.
 *      시사점 카드가 없으면 score-cards 다음, 그것도 없으면 city-detail 끝.
 */
function renderAiInterpretationCard(cityId) {
  const existing = document.getElementById('ai-interpretation-card');
  if (existing) existing.remove();

  if (!aiInterpretations) return;
  const data = getAiInterpretation(cityId);
  if (!data.city && !data.zone) return; // 둘 다 없으면 카드 자체 생략

  const city = data.city;
  const zone = data.zone;

  const card = document.createElement('section');
  card.id = 'ai-interpretation-card';
  card.className = 'ai-card';
  card.setAttribute('aria-label', `${city?.name || cityId} AI 해석`);

  // 헤드라인
  let html = `
    <header class="ai-card-header">
      <span class="ai-card-emoji" aria-hidden="true">💡</span>
      <div class="ai-card-titles">
        <h3>AI 해석 · ${city?.name || cityId}</h3>
        ${city?.headline
          ? `<p class="ai-card-headline">${city.headline}</p>`
          : (zone?.summary ? `<p class="ai-card-headline">${zone.summary}</p>` : '')}
      </div>
      <span class="ai-card-badge">사전 작성</span>
    </header>
  `;

  // 강점·약점
  if (city && (city.strengths?.length || city.weaknesses?.length)) {
    html += '<div class="ai-card-pros-cons">';
    if (city.strengths?.length) {
      html += `
        <div class="ai-card-side ai-card-strengths">
          <h4>강점</h4>
          <ul>${city.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
        </div>`;
    }
    if (city.weaknesses?.length) {
      html += `
        <div class="ai-card-side ai-card-weaknesses">
          <h4>약점</h4>
          <ul>${city.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>
        </div>`;
    }
    html += '</div>';
  }

  // 정책 권고
  if (city?.policy_recommendation) {
    html += `
      <div class="ai-card-policy">
        <h4>정책 권고 방향</h4>
        <p>${city.policy_recommendation}</p>
      </div>`;
  } else if (zone?.policy_direction) {
    html += `
      <div class="ai-card-policy">
        <h4>권역 권고 방향</h4>
        <p>${zone.policy_direction}</p>
      </div>`;
  }

  // 푸터 — 데이터 출처·향후 계획
  html += `
    <footer class="ai-card-footer">
      <small>
        💬 본 해석은 보고서·인터뷰 기반 사전 작성 텍스트입니다 (LLM 실시간 분석 아님).
        ${aiInterpretations._meta?.future_work ? `<br>→ 향후 계획: ${aiInterpretations._meta.future_work}` : ''}
      </small>
    </footer>`;

  card.innerHTML = html;

  // 시사점 카드 다음, 없으면 score-cards 다음, 그것도 없으면 city-detail 끝
  const anchor = document.getElementById('sigun-insight-card')
              || document.getElementById('score-cards');
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
  } else {
    const cityDetail = document.getElementById('city-detail');
    if (cityDetail) cityDetail.appendChild(card);
  }
}

/**
 * 시군 기본 통계 섹션 렌더 (호환 래퍼)
 * @param {string} cityId
 */
function renderKosisSigunStats(cityId) {
  const city = CITIES[cityId];
  renderRegionBasicStats('sigun', cityId, city ? `${city.name} 전체` : cityId);
}

/**
 * 시군/읍면 기본 통계 섹션 렌더 (3-layer 스키마)
 *
 * region-meta.json 구조:
 *   [level][id].raw[field]      = { value, year, source: 'kosis:*'|'sgis:*'|'boundary:*' }
 *   [level][id].computed[field] = { value, unit, formula, inputs }
 *   [level][id].manual[field]   = { value, year, source, updated_by, updated_at }
 *
 * 카드 표시 우선순위: computed > raw > manual. 데이터가 전혀 없는 항목은 숨긴다.
 *
 * @param {'sigun'|'dong'|'ri'} level
 * @param {string} regionId
 * @param {string} regionLabel
 */
function renderRegionBasicStats(level, regionId, regionLabel) {
  const section = document.getElementById('kosis-sigun-stats');
  const grid    = document.getElementById('kosis-stats-grid');
  const noteEl  = document.getElementById('kosis-source-note');
  const btn     = document.getElementById('kosis-toggle-btn');
  const titleEl = section && section.querySelector('.kosis-section-title');
  const labelEl = btn && btn.querySelector('.kosis-toggle-label');
  if (!section || !grid) return;

  if (level === 'ri') {
    section.classList.add('hidden');
    if (btn) btn.classList.add('hidden');
    return;
  }

  const meta = regionMeta && regionMeta[level] && regionMeta[level][regionId];
  if (!meta || (!meta.raw && !meta.computed && !meta.manual)) {
    section.classList.add('hidden');
    if (btn) btn.classList.add('hidden');
    return;
  }

  // 3-layer 통합 조회 함수 — 어느 층에 있든 값과 메타 반환
  // 관리자 수동 편집값(state.manualOverrides) 은 manual 층보다 우선 (사용자 의도가 가장 최신)
  const adminOverrides = (level === 'sigun'
      && state.manualOverrides && state.manualOverrides[regionId])
    || null;
  function readField(keys) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      if (adminOverrides    && adminOverrides[key])    return { ...adminOverrides[key],    _layer: 'manual', _key: key };
      if (meta.computed && meta.computed[key]) return { ...meta.computed[key], _layer: 'computed', _key: key };
      if (meta.raw      && meta.raw[key])      return { ...meta.raw[key],      _layer: 'raw',      _key: key };
      if (meta.manual   && meta.manual[key])   return { ...meta.manual[key],   _layer: 'manual',   _key: key };
    }
    return null;
  }

  // 카드 정의 — 어떤 키든 readField()로 어느 층이든 표시 가능
  // 데이터 미수집 항목은 readField()가 null 반환 → 카드 자동 숨김
  const STAT_DEFS = [
    // ── 기본 ──
    { key: ['adm_nm'],             label: '읍면명',         emoji: '📍', fmt: v => String(v), levels: ['dong'] },
    { key: ['population', 'tot_ppltn'], label: '총인구',    emoji: '👥', fmt: v => Number(v).toLocaleString() + ' 명' },
    { key: ['households', 'tot_family'], label: '세대·가구 수', emoji: '🏠', fmt: v => Number(v).toLocaleString() + ' 가구' },
    { key: 'area',                 label: '면적',           emoji: '🗺️', fmt: v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' km²' },

    // ── computed (산식 계산값 — 핵심 농촌다움 지표) ──
    { key: 'L1_pop_growth_rate',   label: '인구증가율 (L1)', emoji: '📈', fmt: v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' %' },
    { key: 'L2_aging_index',       label: '노령화지수 (L2)', emoji: '👴', fmt: v => v.toFixed(1) },
    { key: 'L3_net_migration_rate',label: '인구순이동률 (L3)', emoji: '🚚', fmt: v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' ‰' },
    { key: ['W2_business_count', 'corp_cnt', 'all_corp_cnt'], label: '사업체 수 (W2)', emoji: '🏢', fmt: v => Number(v).toLocaleString() + ' 개' },
    { key: 'W8_service_sales_workers', label: '서비스판매 종사자 (W8)', emoji: '🛍️', fmt: v => Number(v).toLocaleString() + ' 명' },
    { key: 'W5_agri_young_manager_ratio', label: '농업 세대교체 (W5)', emoji: '🌱', fmt: v => Number(v).toFixed(2) + ' %' },
    { key: 'W6_young_return_farm_ratio', label: '청년 귀농 유입 (W6)', emoji: '🧑‍🌾', fmt: v => Number(v).toFixed(2) + ' %' },
    { key: 'W7_eco_certified_farm_ratio', label: '친환경 인증 농가 (W7)', emoji: '✅', fmt: v => Number(v).toFixed(2) + ' %' },
    { key: 'R4_experience_programs_per_1000', label: '농촌체험 프로그램 (R4)', emoji: '🎒', fmt: v => Number(v).toFixed(3) + ' 건/천명' },
    { key: 'R5_good_water_rate', label: '양호수질 하천 (R5)', emoji: '💧', fmt: v => Number(v).toFixed(2) + ' %' },
    { key: 'R6_park_area_per_1000', label: '수변·생태쉼터 (R6)', emoji: '🏞️', fmt: v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ㎡/천명' },

    // ── SGIS raw (보조 지표) ──
    { key: 'avg_age',              label: '평균 나이',      emoji: '🎂', fmt: v => v.toFixed(1) + ' 세' },
    { key: 'ppltn_dnsty',          label: '인구밀도',       emoji: '🌆', fmt: v => Number(v).toLocaleString() + ' 명/㎢' },
    { key: 'all_tot_worker',       label: '전산업 종사자',  emoji: '👷', fmt: v => Number(v).toLocaleString() + ' 명' },
    { key: 'farm_cnt',             label: '농가 수',        emoji: '🌾', fmt: v => Number(v).toLocaleString() + ' 농가' },
    { key: 'forestry_cnt',         label: '임가 수',        emoji: '🌲', fmt: v => Number(v).toLocaleString() + ' 임가' },
    { key: 'fishery_cnt',          label: '어가 수',        emoji: '🐟', fmt: v => Number(v).toLocaleString() + ' 어가' },
    { key: ['tot_house', 'house_cnt'], label: '총 주택',     emoji: '🏘️', fmt: v => Number(v).toLocaleString() + ' 호' },
    { key: 'housing_supply_rate',   label: '주택보급률',      emoji: '🏡', fmt: v => Number(v).toFixed(1) + ' %' },
    { key: 'medical_facility_count', label: '의료시설 수',    emoji: '🏥', fmt: v => Number(v).toLocaleString() + ' 개' },
    { key: 'rural_experience_farm_count', label: '체험농장 수', emoji: '🌿', fmt: v => Number(v).toLocaleString() + ' 개' },
    { key: 'urban_park_count',      label: '도시공원 수',     emoji: '🌳', fmt: v => Number(v).toLocaleString() + ' 개' },
    { key: 'urban_park_area',       label: '도시공원 면적',   emoji: '🟩', fmt: v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ㎡' },
    { key: 'center_lat',           label: '대표 위도',      emoji: '↕️', fmt: v => Number(v).toFixed(5), levels: ['dong'] },
    { key: 'center_lng',           label: '대표 경도',      emoji: '↔️', fmt: v => Number(v).toFixed(5), levels: ['dong'] },

    // ── manual (수동 입력 — 있을 때만 표시) ──
    { key: 'W3_fiscal_independence', label: '재정자립도 (W3)', emoji: '💼', fmt: v => v.toFixed(1) + ' %' },
    { key: 'W4_grdp',                label: 'GRDP (W4)',     emoji: '💰', fmt: v => v.toLocaleString() + ' 억원' },
    { key: 'R8_heritage_count',      label: '국가유산 (R8)', emoji: '🏯', fmt: v => v.toLocaleString() + ' 개' },
  ];

  // 기준 기간 포맷 (202604 → 2026년 4월)
  const fmtPeriod = (p) => {
    if (!p) return '';
    const s = String(p);
    if (s.length === 6 && /^\d+$/.test(s)) return `${s.slice(0, 4)}년 ${parseInt(s.slice(4), 10)}월`;
    if (s.length === 4 && /^\d+$/.test(s)) return `${s}년`;
    return s;
  };

  // 층별 배지 클래스/라벨
  const getBadge = (rec) => {
    const source = String(rec.source || '');
    if (source.startsWith('local0427:')) return { cls: 'kosis-badge-local', label: '0427' };
    if (source.startsWith('sgis:')) return { cls: 'kosis-badge-sgis', label: 'SGIS' };
    if (source.startsWith('boundary:')) return { cls: 'kosis-badge-boundary', label: '경계' };
    if (source.startsWith('kosis:')) return { cls: 'kosis-badge-kosis', label: 'KOSIS' };
    if (rec._layer === 'computed') return { cls: 'kosis-badge-computed', label: '계산' };
    if (rec._layer === 'manual') return { cls: 'kosis-badge-manual', label: '수동' };
    return { cls: 'kosis-badge-kosis', label: '원천' };
  };

  const getSourceLabel = (rec) => {
    const source = String(rec.source || '');
    if (source.startsWith('local0427:')) return '0427 확정 로컬 데이터';
    if (source.startsWith('kosis:')) return 'KOSIS Open API';
    if (source.startsWith('sgis:')) return 'SGIS Open API';
    if (source.startsWith('boundary:')) return '읍면 경계 파일';
    if (rec._layer === 'computed') return '산식 자동 계산';
    if (rec._layer === 'manual') return '수동 입력';
    return source || rec._layer || '원천 데이터';
  };

  const cards = [];
  const sources = new Set();

  STAT_DEFS.forEach(def => {
    if (def.levels && !def.levels.includes(level)) return;
    const rec = readField(def.key);
    if (!rec || rec.value == null) return;
    const period = fmtPeriod(rec.year || '');
    const badge  = getBadge(rec);
    const tooltip = rec.formula
      ? `${def.label} = ${rec.formula}`
      : (rec.source || '');

    sources.add(getSourceLabel(rec));

    cards.push(`
      <div class="kosis-stat-card" title="${tooltip}">
        <div class="kosis-stat-top">
          <span class="kosis-stat-emoji">${def.emoji}</span>
          <span class="kosis-stat-badge ${badge.cls}">${badge.label}</span>
        </div>
        <div class="kosis-stat-value">${def.fmt(rec.value)}</div>
        <div class="kosis-stat-label">${def.label}</div>
        ${period ? `<div class="kosis-stat-period">${period}</div>` : ''}
      </div>`);
  });

  if (cards.length === 0) {
    section.classList.add('hidden');
    if (btn) btn.classList.add('hidden');
    return;
  }
  grid.innerHTML = cards.join('');

  if (titleEl) titleEl.textContent = `📊 ${regionLabel || '지역'} 기본 통계`;
  if (labelEl) {
    labelEl.textContent = level === 'dong'
      ? '📊 읍면 기본 통계 (SGIS · 경계)'
      : '📊 시군 기본 통계 (KOSIS · SGIS)';
  }

  // 출처 노트
  if (noteEl) {
    noteEl.textContent = '출처: ' + [...sources].join(' · ');
  }

  section.classList.remove('hidden');
  if (btn) btn.classList.remove('hidden');
  // 'is-collapsed' 는 사용자 토글로만 변경 — 여기서는 건드리지 않음 (기본 접힘 상태 유지)
}

/**
 * KOSIS 토글 버튼 초기화 (DOMContentLoaded에서 1회 호출)
 */
function initKosisToggle() {
  const btn = document.getElementById('kosis-toggle-btn');
  const sec = document.getElementById('kosis-sigun-stats');
  if (!btn || !sec) return;
  btn.addEventListener('click', () => {
    const isCollapsed = sec.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!isCollapsed));
    const icon = btn.querySelector('.kosis-toggle-icon');
    const hint = btn.querySelector('.kosis-toggle-hint');
    if (icon) icon.textContent = isCollapsed ? '▶' : '▼';
    if (hint) hint.textContent = isCollapsed ? '클릭하여 펼치기' : '클릭하여 접기';
  });
}

// ===================================================================
// === 일반/관리자 뷰 토글 (피드백 #6) ===
// ===================================================================

const VIEW_MODE_STORAGE_KEY = 'rural-dashboard.viewMode';
const MANUAL_OVERRIDES_STORAGE_KEY = 'rural-dashboard.manualOverrides';

/**
 * 헤더의 일반/관리자 토글을 초기화하고 저장된 모드를 복원한다.
 * - localStorage 에 마지막 선택 모드 저장 ('public' | 'admin')
 * - body 에 'view-admin' 클래스 추가로 .admin-only 요소 표시
 * - 모드 전환 시 현재 선택 시군 패널 즉시 재렌더
 */
function initViewModeToggle() {
  // localStorage 복원
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (saved === 'admin' || saved === 'public') state.viewMode = saved;
    const savedOverrides = localStorage.getItem(MANUAL_OVERRIDES_STORAGE_KEY);
    if (savedOverrides) state.manualOverrides = JSON.parse(savedOverrides) || {};
  } catch (err) {
    console.warn('[viewMode] localStorage 복원 실패:', err);
  }

  applyViewMode(state.viewMode);

  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.view === 'admin' ? 'admin' : 'public';
      if (mode === state.viewMode) return;
      state.viewMode = mode;
      try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode); } catch (err) { /* ignore */ }
      applyViewMode(mode);
      // 현재 시군 패널 갱신 (관리자 카드 표시·숨김)
      if (state.selectedCity) updateDetailPanel(state.selectedCity);
    });
  });
}

/**
 * body 클래스와 토글 버튼 활성 상태를 한 번에 적용한다.
 * @param {'public'|'admin'} mode
 */
function applyViewMode(mode) {
  document.body.classList.toggle('view-admin', mode === 'admin');
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.view === mode);
    btn.setAttribute('aria-pressed', String(btn.dataset.view === mode));
  });
}

/**
 * 관리자 모드에서 manual 층 + 자율지표 선정을 편집하는 패널.
 * 시군 패널 안에서 score-cards 다음 자리에 삽입된다 (인사이트 카드 다음).
 * @param {string} cityId
 */
function renderAdminEditPanel(cityId) {
  // 기존 카드 제거 (시군 전환·모드 전환 시 재렌더)
  const existing = document.getElementById('admin-edit-panel');
  if (existing) existing.remove();

  if (state.viewMode !== 'admin') return;
  const city = CITIES[cityId];
  if (!city) return;

  const section = document.createElement('section');
  section.id = 'admin-edit-panel';
  section.className = 'admin-edit-panel admin-only';
  section.setAttribute('aria-label', `${city.name} 관리자 편집`);

  // 자율지표 풀 — 모든 후보 표시, 선정된 것은 체크 (최대 4개 제한)
  const allJayulKeys = Object.keys(JAYUL_INDICATORS_POOL || {});
  const selected = new Set(city.selectedJayulKeys || []);
  const MAX_SELECTED = 4;

  // manual 층 편집 — 현재 region-meta.json 의 raw/computed 와 겹치지 않는 추가 메모성 항목 + 자주 쓰는 W3 재정자립도
  const overrides = (state.manualOverrides && state.manualOverrides[cityId]) || {};
  const MANUAL_FIELDS = [
    { key: 'W3_fiscal_independence', label: '재정자립도 (W3) 수동값', unit: '%', step: '0.1', placeholder: '예: 32.5' },
    { key: 'note', label: '관리자 메모', type: 'textarea', placeholder: '시군별 보강 사항을 기록하세요.' },
  ];

  let html = `
    <header class="admin-edit-head">
      <span class="admin-edit-emoji" aria-hidden="true">✏️</span>
      <div>
        <h3>${city.name} 관리자 편집</h3>
        <p class="admin-edit-hint">변경 사항은 이 브라우저에만 저장됩니다 (localStorage). 서버 저장은 별도 백엔드 필요.</p>
      </div>
    </header>
    <div class="admin-edit-body">
      <fieldset class="admin-jayul-fieldset">
        <legend>자율지표 선정 (최대 ${MAX_SELECTED}개)</legend>
        <div class="admin-jayul-grid">
  `;
  allJayulKeys.forEach(key => {
    const meta = JAYUL_INDICATORS_POOL[key] || {};
    const isChecked = selected.has(key);
    html += `
      <label class="admin-jayul-item ${isChecked ? 'is-checked' : ''}">
        <input type="checkbox"
               data-jayul-key="${key}"
               ${isChecked ? 'checked' : ''}
               aria-label="${meta.name || key} 선정 토글">
        <span class="admin-jayul-key">${key}</span>
        <span class="admin-jayul-name">${meta.name || key}</span>
      </label>`;
  });
  html += `
        </div>
        <p class="admin-jayul-status" id="admin-jayul-status" aria-live="polite">선정 ${selected.size}/${MAX_SELECTED}개</p>
      </fieldset>

      <fieldset class="admin-manual-fieldset">
        <legend>수동 입력 데이터</legend>
  `;
  MANUAL_FIELDS.forEach(field => {
    const val = overrides[field.key];
    const valueAttr = (val && val.value != null) ? String(val.value) : '';
    if (field.type === 'textarea') {
      html += `
        <label class="admin-manual-row">
          <span class="admin-manual-label">${field.label}</span>
          <textarea data-manual-key="${field.key}"
                    rows="2"
                    placeholder="${field.placeholder || ''}"
                    class="admin-manual-input">${valueAttr.replace(/</g, '&lt;')}</textarea>
        </label>`;
    } else {
      html += `
        <label class="admin-manual-row">
          <span class="admin-manual-label">${field.label}${field.unit ? ` (${field.unit})` : ''}</span>
          <input type="number"
                 data-manual-key="${field.key}"
                 step="${field.step || 'any'}"
                 value="${valueAttr}"
                 placeholder="${field.placeholder || ''}"
                 class="admin-manual-input">
        </label>`;
    }
  });
  html += `
      </fieldset>

      <div class="admin-edit-actions">
        <button type="button" class="admin-btn admin-btn-primary" id="admin-save-btn">💾 저장</button>
        <button type="button" class="admin-btn admin-btn-ghost" id="admin-reset-btn">↺ 초기화</button>
      </div>
    </div>
  `;
  section.innerHTML = html;

  // 인사이트 카드 다음에 삽입 (없으면 score-cards 다음)
  const anchor = document.getElementById('sigun-insight-card') || document.getElementById('score-cards');
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(section, anchor.nextSibling);
  } else {
    const cityDetail = document.getElementById('city-detail');
    if (cityDetail) cityDetail.appendChild(section);
  }

  // 체크박스: 선정 4개 제한 + UI 즉시 반영
  section.querySelectorAll('input[data-jayul-key]').forEach(input => {
    input.addEventListener('change', () => {
      const checked = section.querySelectorAll('input[data-jayul-key]:checked');
      if (checked.length > MAX_SELECTED) {
        input.checked = false;
        showInlineToast(`자율지표는 최대 ${MAX_SELECTED}개까지 선정할 수 있어요.`);
        return;
      }
      input.closest('.admin-jayul-item')?.classList.toggle('is-checked', input.checked);
      const status = section.querySelector('#admin-jayul-status');
      if (status) status.textContent = `선정 ${checked.length}/${MAX_SELECTED}개`;
    });
  });

  // 저장 버튼
  const saveBtn = section.querySelector('#admin-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => saveAdminEdits(cityId, section));
  }
  const resetBtn = section.querySelector('#admin-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => resetAdminEdits(cityId));
  }
}

/**
 * 관리자 편집을 저장: 자율지표 선정은 CITIES[cityId].selectedJayulKeys 에 반영,
 * 수동 입력은 state.manualOverrides + localStorage 에 누적 저장.
 */
function saveAdminEdits(cityId, container) {
  const city = CITIES[cityId];
  if (!city) return;

  // 자율지표 선정
  const newSelected = Array.from(container.querySelectorAll('input[data-jayul-key]:checked'))
    .map(i => i.dataset.jayulKey);
  city.selectedJayulKeys = newSelected;

  // 수동 입력
  const overrides = state.manualOverrides[cityId] || {};
  container.querySelectorAll('[data-manual-key]').forEach(field => {
    const key = field.dataset.manualKey;
    const raw = field.value?.trim();
    if (!raw) {
      delete overrides[key];
      return;
    }
    const isNumber = field.tagName === 'INPUT' && field.type === 'number';
    overrides[key] = {
      value: isNumber ? Number(raw) : raw,
      year: new Date().getFullYear(),
      source: 'manual:admin-ui',
      updated_by: 'admin',
      updated_at: new Date().toISOString(),
    };
  });
  state.manualOverrides[cityId] = overrides;

  try {
    localStorage.setItem(MANUAL_OVERRIDES_STORAGE_KEY, JSON.stringify(state.manualOverrides));
  } catch (err) {
    console.warn('[admin] manualOverrides 저장 실패:', err);
  }

  showInlineToast('저장됨 · 패널을 갱신합니다.');
  // 패널 전체 재렌더 → 자율지표 카드·인사이트 카드 갱신
  updateDetailPanel(cityId);
}

/**
 * 현재 시군의 관리자 편집(자율지표 선정·수동 입력)을 권역 기본값으로 되돌린다.
 */
function resetAdminEdits(cityId) {
  const city = CITIES[cityId];
  if (!city) return;
  // 자율지표 — 권역 추천값으로 복원 (CITY_ZONE[cityId] 매핑 사용)
  const zone = typeof CITY_ZONE === 'object' ? CITY_ZONE[cityId] : null;
  if (zone && typeof RECOMMENDED_JAYUL_BY_ZONE === 'object' && RECOMMENDED_JAYUL_BY_ZONE[zone]) {
    city.selectedJayulKeys = [...RECOMMENDED_JAYUL_BY_ZONE[zone]];
  }
  // 수동 입력 — 이 시군 항목만 제거
  if (state.manualOverrides[cityId]) {
    delete state.manualOverrides[cityId];
    try {
      localStorage.setItem(MANUAL_OVERRIDES_STORAGE_KEY, JSON.stringify(state.manualOverrides));
    } catch (err) { /* ignore */ }
  }
  showInlineToast('권역 기본값으로 초기화했습니다.');
  updateDetailPanel(cityId);
}

/**
 * 시군 패널 안에 짧은 토스트 (편집 결과 확인용).
 * 기존 landing-toast 와 겹치지 않게 별도 인스턴스 사용.
 */
function showInlineToast(message) {
  let toast = document.getElementById('admin-inline-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-inline-toast';
    toast.className = 'admin-inline-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showInlineToast._timer);
  showInlineToast._timer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2400);
}

function renderFieldSurveySection(cityId) {
  const old = document.getElementById('field-survey-section');
  if (old) old.remove();

  const cityDetail = document.getElementById('city-detail');
  if (!cityDetail || cityId !== 'namyangju') return;

  const items = ((fieldSurveyMeta && fieldSurveyMeta.items) || [])
    .filter(item => !item.city_id || item.city_id === cityId);
  if (items.length === 0) return;

  const section = document.createElement('section');
  section.id = 'field-survey-section';
  section.className = 'field-survey-section';
  section.innerHTML = `
    <div class="field-survey-head">
      <div>
        <h3>현장조사 입력/관리</h3>
        <p>남양주시 자율지표 중 기존 통계가 아니라 담당자·현장 인터뷰로 채워야 하는 항목입니다.</p>
      </div>
      <span class="field-survey-count">${items.length}개 항목</span>
    </div>
    <div class="field-survey-grid">
      ${items.map(item => `
        <article class="field-survey-card">
          <div class="field-survey-card-top">
            <span class="field-survey-category">${item.category_label || '자율'}</span>
            <span class="data-status-badge status-field_survey">현장조사</span>
          </div>
          <h4>${item.indicator_name || '-'}</h4>
          <dl>
            <dt>목적</dt><dd>${item.purpose || '-'}</dd>
            <dt>대상</dt><dd>${item.target || '-'}</dd>
            <dt>규모</dt><dd>${item.sample_size || '-'}</dd>
            <dt>방법</dt><dd>${item.method || '-'}</dd>
          </dl>
          <details>
            <summary>조사 문항 보기</summary>
            <p>${(item.questions || '-').replace(/\n/g, '<br>')}</p>
          </details>
        </article>
      `).join('')}
    </div>
  `;

  const anchor = document.getElementById('kosis-toggle-btn') || document.getElementById('add-comparison-wrapper');
  if (anchor) {
    cityDetail.insertBefore(section, anchor);
  } else {
    cityDetail.appendChild(section);
  }
}

// ===================================================================
// === 남양주 읍면 비교 섹션 (피드백 #2 — 시군보다 읍면 단위 비교 강화)
// ===================================================================

// CANON 키 기준 비교 지표. value 조회는 getEupIndicator(eupName, key) 경유 →
// 현장조사(field) > 시뮬레이션(sim) > 시군고정(sigun) 우선순위로 자동 병합·배지 표시.
// 앞쪽 8개(★)는 0531 현장조사 가상데이터가 9개 농촌 읍면에 실제로 제공하는 지표.
const DONG_COMPARE_INDICATORS = [
  { key: 'L4', label: '생활SOC 충족지수',    unit: '점',        higherBetter: true,  zeroBaseline: true  }, // ★field
  { key: 'L6', label: '귀촌 3년 정착률',     unit: '%',         higherBetter: true,  zeroBaseline: true  }, // ★field
  { key: 'W5', label: '농업 세대교체',        unit: '%',         higherBetter: true,  zeroBaseline: true  }, // ★field
  { key: 'W6', label: '청년 귀농 유입',      unit: '%',         higherBetter: true,  zeroBaseline: true  }, // ★field
  { key: 'W7', label: '친환경 인증 농가',    unit: '%',         higherBetter: true,  zeroBaseline: true  }, // ★field
  { key: 'W9', label: '농촌체험 프로그램',   unit: '건/천명',   higherBetter: true,  zeroBaseline: true  }, // ★field
  { key: 'R6', label: '도시텃밭 수용',       unit: '%',         higherBetter: true,  zeroBaseline: true  }, // ★field
  { key: 'R7', label: '주말농원 활성화율',   unit: '%',         higherBetter: true,  zeroBaseline: true  }, // ★field
  { key: 'L1', label: '인구증가율',          unit: '%',         higherBetter: true,  zeroBaseline: false }, // sim
  { key: 'W2', label: '사업체 밀도',         unit: '개/㎢',     higherBetter: true,  zeroBaseline: true  }, // sim
  { key: 'R3', label: '녹지율',              unit: '%',         higherBetter: true,  zeroBaseline: true  }, // sim
  { key: 'R4', label: '양호수질 하천',       unit: '%',         higherBetter: true,  zeroBaseline: true  }, // sim
  { key: 'R5', label: '수변·생태쉼터',       unit: '㎡/천명',   higherBetter: true,  zeroBaseline: true  }, // sim
];

// 출처 배지 메타 (현장조사/시뮬레이션/시군고정)
const EUP_SOURCE_BADGE = {
  field: { ko: '현장조사', cls: 'status-field' },
  sim:   { ko: '시뮬레이션', cls: 'status-simulation' },
  sigun: { ko: '시군고정', cls: 'status-sigun-fixed' },
};

const CLUSTER_LABELS = {
  urban:   { ko: '도심형', color: '#4A90D9' },
  transit: { ko: '전이형', color: '#E8A44A' },
  rural:   { ko: '농촌형', color: '#52A866' },
};

const DONG_COMPARE_MAX_SELECT = 5;

// 남양주 읍면 비교 상태 (시군 전환 시 초기화됨)
let dongCompareSelection = []; // [admCd, ...]
let dongCompareIndicator = 'L4'; // 현재 보고 있는 지표 (CANON 키)
let dongCompareChart = null;

/**
 * 남양주 시군 패널 안에 읍면 비교 섹션을 렌더한다.
 * 시뮬레이션 데이터가 로드되어 있고 cityId === 'namyangju' 일 때만 표시.
 * @param {string} cityId
 */
function renderDongComparison(cityId) {
  const old = document.getElementById('dong-comparison-section');
  if (old) old.remove();

  if (cityId !== 'namyangju') return;
  const dongs = listSimulationDongs();
  if (!dongs.length) return;

  const cityDetail = document.getElementById('city-detail');
  if (!cityDetail) return;

  // 기본 선정 — 클러스터별 대표 (urban 1 + transit 1 + rural 1)
  if (dongCompareSelection.length === 0) {
    const pick = (cluster) => dongs.find(d => d.cluster === cluster);
    dongCompareSelection = [pick('urban'), pick('transit'), pick('rural')]
      .filter(Boolean)
      .map(d => d.admCd);
  }

  const section = document.createElement('section');
  section.id = 'dong-comparison-section';
  section.className = 'dong-compare-section';
  section.setAttribute('aria-label', '남양주 읍면 비교');

  const meta = simulationData && simulationData._meta;
  const versionTag = meta ? ` (${meta.version})` : '';

  let html = `
    <header class="dong-compare-head">
      <div class="dong-compare-title">
        <span aria-hidden="true">📍</span>
        <h3>남양주 ${dongs.length}개 읍면 비교</h3>
      </div>
      <p class="dong-compare-subtitle">
        <span class="data-status-badge status-field">현장조사</span>
        <span class="data-status-badge status-simulation">시뮬레이션</span>
        <span class="data-status-badge status-sigun-fixed">시군고정</span>
        혼합 데이터${versionTag} · 8개 지표는 9개 농촌 읍면 현장조사 가상값, 나머지는 시뮬레이션/시군 고정값
      </p>
    </header>

    <div class="dong-compare-toolbar">
      <label class="dong-compare-indicator-label" for="dong-compare-indicator-select">지표 선택</label>
      <select id="dong-compare-indicator-select" class="dong-compare-select" aria-label="비교 지표 선택">
  `;
  DONG_COMPARE_INDICATORS.forEach(ind => {
    const sel = ind.key === dongCompareIndicator ? 'selected' : '';
    html += `<option value="${ind.key}" ${sel}>${ind.label}${ind.unit ? ` (${ind.unit})` : ''}</option>`;
  });
  html += `
      </select>
      <span class="dong-compare-status" id="dong-compare-status" aria-live="polite">
        선택 ${dongCompareSelection.length}/${DONG_COMPARE_MAX_SELECT}
      </span>
      <button type="button" id="dong-compare-clear" class="dong-compare-mini-btn" aria-label="선택 초기화">↺ 초기화</button>
    </div>

    <div class="dong-compare-chips" role="group" aria-label="읍면 선택">
  `;
  // 클러스터별 그룹화
  ['urban', 'transit', 'rural'].forEach(cluster => {
    const cl = CLUSTER_LABELS[cluster];
    const items = dongs.filter(d => d.cluster === cluster);
    if (!items.length) return;
    html += `
      <fieldset class="dong-compare-cluster" style="--cluster-color: ${cl.color}">
        <legend>${cl.ko} <span class="dong-compare-cluster-n">${items.length}개</span></legend>
        <div class="dong-compare-chip-list">
    `;
    items.forEach(d => {
      const isSel = dongCompareSelection.includes(d.admCd);
      html += `
        <label class="dong-compare-chip ${isSel ? 'is-selected' : ''}">
          <input type="checkbox"
                 data-adm-cd="${d.admCd}"
                 ${isSel ? 'checked' : ''}
                 aria-label="${d.adm_nm} 비교 토글">
          <span class="dong-compare-chip-name">${d.adm_nm}</span>
        </label>`;
    });
    html += `</div></fieldset>`;
  });
  html += `
    </div>

    <div class="dong-compare-chart-wrap">
      <canvas id="dong-compare-chart" height="220" aria-label="읍면 비교 막대 차트"></canvas>
    </div>

    <details class="dong-compare-table-wrap">
      <summary>전체 표로 보기 (${DONG_COMPARE_INDICATORS.length}개 지표 · ${dongs.length}개 읍면)</summary>
      <div class="dong-compare-table-scroll">
        <table class="dong-compare-table">
          <thead><tr>
            <th>읍면</th>
            <th>클러스터</th>
            ${DONG_COMPARE_INDICATORS.map(i => `<th title="${i.label}">${i.key.split('_')[0]}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${dongs.map(d => {
              const isSel = dongCompareSelection.includes(d.admCd);
              const cl = CLUSTER_LABELS[d.cluster];
              return `
                <tr class="${isSel ? 'is-selected' : ''}">
                  <td class="dong-compare-tbl-name">${d.adm_nm}</td>
                  <td><span class="cluster-tag" style="background:${cl.color}">${cl.ko}</span></td>
                  ${DONG_COMPARE_INDICATORS.map(i => {
                    const r = getEupIndicator(d.adm_nm, i.key);
                    if (!r || r.value == null) return `<td class="dong-compare-tbl-val">-</td>`;
                    return `<td class="dong-compare-tbl-val src-${r.source}" title="출처: ${EUP_SOURCE_BADGE[r.source]?.ko || r.source}">${r.value}</td>`;
                  }).join('')}
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </details>

    <footer class="dong-compare-footnote">
      <small>💡 클러스터별 대표 1개씩 자동 선택되어 있어요. 다른 읍면을 비교하려면 칩을 클릭하세요 (최대 ${DONG_COMPARE_MAX_SELECT}개).</small>
    </footer>
  `;
  section.innerHTML = html;

  // 자율지표 카드 다음, KOSIS 토글 앞에 삽입
  const anchor = document.getElementById('kosis-toggle-btn')
              || document.getElementById('add-comparison-wrapper');
  if (anchor) cityDetail.insertBefore(section, anchor);
  else cityDetail.appendChild(section);

  // 이벤트 바인딩
  bindDongCompareInteractions(section, dongs);

  // 첫 차트 그리기
  drawDongCompareChart(dongs);
}

/**
 * 비교 섹션의 칩·드롭다운·초기화 버튼 이벤트 바인딩
 */
function bindDongCompareInteractions(container, dongs) {
  // 칩 클릭 (체크박스)
  container.querySelectorAll('input[data-adm-cd]').forEach(input => {
    input.addEventListener('change', () => {
      const admCd = input.dataset.admCd;
      if (input.checked) {
        if (dongCompareSelection.length >= DONG_COMPARE_MAX_SELECT) {
          input.checked = false;
          showInlineToast(`읍면은 최대 ${DONG_COMPARE_MAX_SELECT}개까지 비교할 수 있어요.`);
          return;
        }
        if (!dongCompareSelection.includes(admCd)) dongCompareSelection.push(admCd);
      } else {
        dongCompareSelection = dongCompareSelection.filter(c => c !== admCd);
      }
      input.closest('.dong-compare-chip')?.classList.toggle('is-selected', input.checked);
      const status = container.querySelector('#dong-compare-status');
      if (status) status.textContent = `선택 ${dongCompareSelection.length}/${DONG_COMPARE_MAX_SELECT}`;
      // 표 행 강조 갱신
      container.querySelectorAll('.dong-compare-table tbody tr').forEach((tr, idx) => {
        tr.classList.toggle('is-selected', dongCompareSelection.includes(dongs[idx].admCd));
      });
      drawDongCompareChart(dongs);
    });
  });

  // 지표 드롭다운
  const sel = container.querySelector('#dong-compare-indicator-select');
  if (sel) {
    sel.addEventListener('change', () => {
      dongCompareIndicator = sel.value;
      drawDongCompareChart(dongs);
    });
  }

  // 초기화
  const clearBtn = container.querySelector('#dong-compare-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      dongCompareSelection = [];
      renderDongComparison('namyangju'); // 섹션 재렌더 (디폴트 선정 다시 채워짐)
    });
  }
}

/**
 * 현재 선택된 읍면들의 막대 차트를 (재)렌더한다.
 * 색상은 클러스터별, 값 라벨은 위에 표시.
 */
function drawDongCompareChart(dongs) {
  const canvas = document.getElementById('dong-compare-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  // 기존 차트 폐기
  if (dongCompareChart) {
    try { dongCompareChart.destroy(); } catch (err) { /* ignore */ }
    dongCompareChart = null;
  }

  const indicator = DONG_COMPARE_INDICATORS.find(i => i.key === dongCompareIndicator) || DONG_COMPARE_INDICATORS[0];
  const selectedSet = new Set(dongCompareSelection);
  const rows = dongs
    .filter(d => selectedSet.has(d.admCd))
    .map(d => {
      const r = getEupIndicator(d.adm_nm, indicator.key);
      return {
        label: d.adm_nm,
        cluster: d.cluster,
        value: (r && r.value != null) ? r.value : 0,
        source: r ? r.source : 'sigun',
      };
    });

  if (rows.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '13px "Noto Sans KR", sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('비교할 읍면을 1개 이상 선택하세요.', canvas.width / 2, canvas.height / 2);
    return;
  }

  dongCompareChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.label),
      datasets: [{
        label: `${indicator.label}${indicator.unit ? ' (' + indicator.unit + ')' : ''}`,
        data: rows.map(r => r.value),
        backgroundColor: rows.map(r => CLUSTER_LABELS[r.cluster]?.color || '#999'),
        borderColor: rows.map(r => CLUSTER_LABELS[r.cluster]?.color || '#999'),
        borderWidth: 1.5,
        borderRadius: 4,
        maxBarThickness: 48,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} ${indicator.unit || ''}`.trim(),
            afterLabel: (ctx) => {
              const row = rows[ctx.dataIndex];
              const lines = [];
              if (row?.cluster) lines.push(`클러스터: ${CLUSTER_LABELS[row.cluster].ko}`);
              if (row?.source) lines.push(`출처: ${EUP_SOURCE_BADGE[row.source]?.ko || row.source}`);
              return lines;
            },
          },
        },
      },
      scales: {
        x: { ticks: { font: { size: 11 } } },
        y: {
          // 영점 기준선: 인구증가율(L1)은 음수 가능 → false, 나머지(% / 밀도 / 비율)는 true
          beginAtZero: indicator.zeroBaseline !== false,
          ticks: { font: { size: 11 } },
          title: { display: !!indicator.unit, text: indicator.unit || '', font: { size: 11 } },
        },
      },
    },
  });
}

/**
 * 삶터/일터/쉼터 점수 카드 업데이트
 * @param {string} cityId
 */
function updateScoreCards(cityId) {
  const container = document.getElementById('score-cards');
  if (!container) return;

  const categories = [
    { key: 'samlter', label: '삶터', emoji: '🏡', colorClass: 'score-samlter' },
    { key: 'ilter',   label: '일터', emoji: '💼', colorClass: 'score-ilter'   },
    { key: 'shimter',  label: '쉼터', emoji: '🌿', colorClass: 'score-shimter'  },
  ];

  container.innerHTML = `
    <div class="score-category-grid">
      ${categories.map(cat => {
        const score = calcCategoryScore(cityId, cat.key).toFixed(1);
        return `
          <div class="score-card ${cat.colorClass}">
            <div class="score-card-label">${cat.emoji} ${cat.label}</div>
            <div class="score-card-value">${score}<span style="font-size:12px;">점</span></div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * 비교 추가 버튼 업데이트
 * @param {string} cityId
 */
function updateComparisonButton(cityId) {
  // HTML의 #add-comparison-btn 사용
  const btn = document.getElementById('add-comparison-btn');
  if (!btn) return;

  const isAdded = state.comparisonCities.includes(cityId);
  btn.textContent = isAdded ? '비교 목록에서 제거' : '비교에 추가 +';
  btn.style.background = isAdded ? '#e74c3c' : 'var(--primary)';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.borderRadius = '6px';
  btn.style.padding = '8px 16px';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '13px';
  btn.onclick = () => toggleComparison(cityId);
}

/**
 * 남양주 자율지표 섹션 업데이트
 * @param {string} cityId
 */
/**
 * 자율지표 섹션 업데이트 — 모든 시군에서 작동 (남양주 전용 아님)
 *
 * 표시 구조:
 *   - 상단 헤더: "자율지표 — N개 선정 / 10개 후보"
 *   - 카드: 모든 후보 표시. 선정된 카드는 강조 색상·체크 배지, 비선정은 회색·"후보" 라벨.
 *
 * @param {string} cityId
 */
function updateJayulSection(cityId) {
  // 기존 섹션 제거 (호환 — 이전 id도 함께 제거)
  const oldByNew = document.getElementById('jayul-extra-section');
  if (oldByNew) oldByNew.remove();
  const oldByLegacy = document.getElementById('namyangju-extra-section');
  if (oldByLegacy) oldByLegacy.remove();

  const city = CITIES[cityId];
  if (!city || !city.jayulIndicators) return;

  const cityDetail = document.getElementById('city-detail');
  if (!cityDetail) return;

  const selectedSet = new Set(city.selectedJayulKeys || []);
  const totalCount  = Object.keys(JAYUL_INDICATORS_POOL).length;
  const selectedCnt = selectedSet.size;

  const section = document.createElement('div');
  section.id = 'jayul-extra-section';
  section.className = 'jayul-section';
  section.innerHTML = `
    <h3 class="section-title jayul-title">
      🎯 자율지표
      <span class="jayul-count-badge">${selectedCnt} 선정 / ${totalCount} 후보</span>
    </h3>
    <p class="jayul-help-text">
      ${city.name}이(가) 농촌다움 종합 점수 산정 시 포함하기로 선정한 지표입니다.
      후보 카드는 데이터는 보유하나 종합 점수에는 미반영.
    </p>
    <div class="jayul-indicator-grid">
      ${Object.entries(JAYUL_INDICATORS_POOL).map(([key, ind]) => {
        const value     = city.jayulIndicators[key];
        const isSelected = selectedSet.has(key);
        const status = getIndicatorDataStatus(cityId, key);
        const catColors = { samlter: '#3498db', ilter: '#e67e22', shimter: '#27ae60' };
        const catColor  = catColors[ind.category] || '#666';
        const stateClass = isSelected ? 'is-selected' : 'is-candidate';
        const stateBadge = isSelected
          ? `<span class="jayul-state-badge selected">✓ 선정</span>`
          : `<span class="jayul-state-badge candidate">후보</span>`;
        return `
          <div class="jayul-ind-card ${stateClass}" data-key="${key}" style="--cat-color:${catColor};">
            <div class="jayul-card-top">
              <span class="jayul-ind-key">${key}</span>
              ${stateBadge}
            </div>
            <div class="jayul-ind-name">${ind.name}</div>
            <div class="jayul-ind-value">${formatValue(value, ind.unit)}</div>
            <div class="jayul-ind-source">${renderStatusBadge(status)}</div>
            <div class="jayul-ind-meta">${ind.spatial} · ${ind.year}년</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  // 자율지표 섹션은 세부지표 다음·KOSIS 토글 앞에 위치 — 시군 패널 우선순위 유지
  const anchorBeforeJayul = document.getElementById('kosis-toggle-btn')
                         || document.getElementById('add-comparison-wrapper');
  if (anchorBeforeJayul) {
    cityDetail.insertBefore(section, anchorBeforeJayul);
  } else {
    cityDetail.appendChild(section);
  }
}

// 역호환 — 옛 이름으로 호출하는 곳이 있을 수 있어 alias 유지
function updateNamyangjuSection(cityId) { return updateJayulSection(cityId); }

// ===================================================================
// === 지표 목록 ===
// ===================================================================

/**
 * 현재 탭에 맞는 지표 목록 업데이트
 */
function updateIndicatorList() {
  const container = document.getElementById('indicator-list');
  if (!container) return;

  const cityId = state.selectedCity;
  const city   = cityId ? CITIES[cityId] : null;

  // 탭별 표시 지표 결정
  let keys = [];
  if (state.activeTab === 'overview') {
    keys = Object.keys(INDICATORS);
  } else {
    const tabToCat = { samlter: 'samlter', ilter: 'ilter', shimter: 'shimter' };
    const cat = tabToCat[state.activeTab];
    if (cat) {
      keys = Object.keys(INDICATORS).filter(k => INDICATORS[k].category === cat);
    } else {
      keys = Object.keys(INDICATORS);
    }
  }

  if (!city || keys.length === 0) {
    container.innerHTML = '<div class="no-city-msg">시군을 선택하면 지표 상세 정보가 표시됩니다.</div>';
    return;
  }

  container.innerHTML = keys.map(key => {
    const ind   = INDICATORS[key];
    const value = city.indicators[key];
    const status = getIndicatorDataStatus(cityId, key);
    const rank  = calcRank(cityId, key);
    const { min, max } = getIndicatorRange(key);
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min + 1e-9)));
    const barPct = (ind.higherBetter ? normalized : 1 - normalized) * 100;

    const catColors = { samlter: '#3498db', ilter: '#e67e22', shimter: '#27ae60' };
    const barColor  = catColors[ind.category] || '#666';

    const rankBadgeColor = rank <= 3 ? '#f39c12' : rank <= 8 ? '#3498db' : '#999';

    return `
      <div class="indicator-item">
        <div class="indicator-header">
          <span class="indicator-key" style="background:${barColor}20;color:${barColor};">${key}</span>
          <span class="indicator-name">${ind.name}</span>
          <span class="indicator-rank-badge" style="background:${rankBadgeColor}20;color:${rankBadgeColor};">${rank}위</span>
        </div>
        <div class="indicator-value-row">
          <span class="indicator-value">${formatValue(value, ind.unit)}</span>
          <span class="indicator-range">범위: ${formatValue(min, ind.unit)} ~ ${formatValue(max, ind.unit)}</span>
        </div>
        <div class="indicator-bar-bg">
          <div class="indicator-bar-fill" style="width:${barPct.toFixed(1)}%;background:${barColor};"></div>
        </div>
        <div class="indicator-meta">
          ${renderStatusBadge(status)}
          <span>${ind.spatial} · ${ind.year}년 · ${ind.formula}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ===================================================================
// === 탭 초기화 및 전환 ===
// ===================================================================

/**
 * 탭 버튼 초기화
 */
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // 초기 활성 탭 설정
  switchTab('overview');
}

/**
 * 탭 전환
 * @param {string} tab - 탭 ID
 */
function switchTab(tab) {
  state.activeTab = tab;

  // 상단 탭(종합·삶터·일터·쉼터) ↔ 지도 코로플레스·단계구분도 범례 동기화
  // (지표 드롭다운은 state.activeIndicator만 사용 — 탭을 바꿀 때 같이 맞춰야 함)
  const mapTabToIndicator = {
    overview: 'total',
    samlter: 'samlter_total',
    ilter: 'ilter_total',
    shimter: 'shimter_total',
  };
  if (Object.prototype.hasOwnProperty.call(mapTabToIndicator, tab)) {
    state.activeIndicator = mapTabToIndicator[tab];
    const sel = document.getElementById('indicator-selector');
    if (sel) {
      const hasOpt = Array.from(sel.options).some(o => o.value === state.activeIndicator);
      if (hasOpt) sel.value = state.activeIndicator;
    }
  }

  // 탭 버튼 활성 상태 업데이트
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 시나리오 패널 표시/숨김 (classList 사용 — .hidden 충돌 방지)
  const scenarioPanel = document.getElementById('scenario-panel');
  if (scenarioPanel) {
    scenarioPanel.classList.toggle('hidden', tab !== 'scenario');
  }

  // city-detail도 시나리오/분석 탭일 때 숨김
  const cityDetail = document.getElementById('city-detail');
  if (cityDetail && !cityDetail.classList.contains('hidden')) {
    cityDetail.style.display = (tab === 'scenario' || tab === 'analysis') ? 'none' : '';
  }

  // 분석 탭 전용 — 지도 영역을 분석 컨테이너로 전환
  const mapEl       = document.getElementById('map-container');
  const analysisEl  = document.getElementById('analysis-container');
  const detailEl    = document.getElementById('detail-panel');
  if (tab === 'analysis') {
    if (mapEl)      mapEl.classList.add('hidden');
    if (analysisEl) analysisEl.classList.remove('hidden');
    if (detailEl)   detailEl.style.display = 'none';
    initAnalysisView();
  } else {
    if (mapEl)      mapEl.classList.remove('hidden');
    if (analysisEl) analysisEl.classList.add('hidden');
    if (detailEl && tab !== 'scenario') detailEl.style.display = '';
  }

  updateIndicatorList();
  updateMapColors();
  updateLegend();

  // 시나리오 탭일 때 레이더 업데이트
  if (tab === 'scenario' && state.selectedCity) {
    renderScenarioCharts(state.selectedCity);
  }
}

// ===================================================================
// === Chart.js 차트 초기화 ===
// ===================================================================

/**
 * 모든 Chart.js 차트 초기화
 */
function initCharts() {
  // 레이더 차트 초기화 (빈 상태)
  renderRadarChart(null);
  renderComparisonChart();
}

/**
 * 기존 Chart 인스턴스 안전하게 제거
 * @param {string} chartKey - state.charts 키
 */
function destroyChart(chartKey) {
  if (state.charts[chartKey]) {
    try {
      state.charts[chartKey].destroy();
    } catch (e) {
      // ignore
    }
    state.charts[chartKey] = null;
  }
}

// ===================================================================
// === 레이더 차트 ===
// ===================================================================

/**
 * 레이더 차트 렌더링
 * @param {string|null} cityId
 */
function renderRadarChart(cityId) {
  const canvas = document.getElementById('radar-canvas');
  if (!canvas) return;

  destroyChart('radar');

  const labels = ['삶터', '일터', '쉼터'];

  let dataValues = [0, 0, 0];
  let dataLabel  = '선택 없음';
  let borderColor  = 'rgba(99,132,255,0.9)';
  let backgroundColor = 'rgba(99,132,255,0.25)';

  if (cityId && CITIES[cityId]) {
    const city = CITIES[cityId];
    dataValues = [
      calcCategoryScore(cityId, 'samlter'),
      calcCategoryScore(cityId, 'ilter'),
      calcCategoryScore(cityId, 'shimter'),
    ];
    dataLabel = city.name;

    const catColorMap = {
      samlter: { border: 'rgba(52,152,219,0.9)', bg: 'rgba(52,152,219,0.25)' },
      ilter:   { border: 'rgba(230,126,34,0.9)',  bg: 'rgba(230,126,34,0.25)'  },
      shimter:  { border: 'rgba(39,174,96,0.9)',   bg: 'rgba(39,174,96,0.25)'   },
    };
    // 레이더는 composite 색상 사용
    borderColor     = 'rgba(52,73,94,0.9)';
    backgroundColor = 'rgba(52,73,94,0.2)';
  }

  const datasets = [{
    label: dataLabel,
    data: dataValues,
    borderColor,
    backgroundColor,
    borderWidth: 2,
    pointBackgroundColor: borderColor,
    pointRadius: 4,
  }];

  // 전체 평균 데이터셋 추가
  const avgValues = ['samlter', 'ilter', 'shimter'].map(cat =>
    Object.keys(CITIES).reduce((sum, id) => sum + calcCategoryScore(id, cat), 0) / 15
  );
  datasets.push({
    label: '경기도 평균',
    data: avgValues,
    borderColor: 'rgba(180,180,180,0.6)',
    backgroundColor: 'rgba(180,180,180,0.1)',
    borderWidth: 1.5,
    borderDash: [5, 5],
    pointRadius: 3,
  });

  state.charts.radar = new Chart(canvas, {
    type: 'radar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            font: { size: 10 },
            color: '#888',
          },
          pointLabels: {
            font: { size: 13, weight: 'bold' },
            color: '#333',
          },
          grid:  { color: 'rgba(0,0,0,0.08)' },
          angleLines: { color: 'rgba(0,0,0,0.08)' },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}점`,
          },
        },
      },
    },
  });
}

/**
 * 레이더 차트 업데이트 (시군 선택 시 호출)
 * @param {string} cityId
 */
function updateRadarChart(cityId) {
  renderRadarChart(cityId);
}

// ===================================================================
// === 비교 차트 ===
// ===================================================================

/**
 * 비교 섹션 토글
 * @param {string} cityId
 */
function toggleComparison(cityId) {
  const idx = state.comparisonCities.indexOf(cityId);
  if (idx >= 0) {
    state.comparisonCities.splice(idx, 1);
  } else {
    if (state.comparisonCities.length >= 5) {
      alert('최대 5개 시군까지 비교할 수 있습니다.');
      return;
    }
    state.comparisonCities.push(cityId);
  }

  updateComparisonCityList();
  renderComparisonChart();

  // 비교 버튼 상태 업데이트
  if (state.selectedCity) {
    updateComparisonButton(state.selectedCity);
  }
}

/**
 * 비교 시군 목록 UI 업데이트
 */
function updateComparisonCityList() {
  const container = document.getElementById('comparison-cities');
  if (!container) return;

  if (state.comparisonCities.length === 0) {
    container.innerHTML = '<div class="no-comparison">시군을 선택한 후 "비교에 추가 +" 버튼을 클릭하세요.</div>';
    return;
  }

  container.innerHTML = state.comparisonCities.map(id => {
    const city = CITIES[id];
    return `
      <div class="comparison-city-tag">
        <span>${city ? city.name : id}</span>
        <button class="remove-comparison-btn" onclick="toggleComparison('${id}')">×</button>
      </div>
    `;
  }).join('');
}

/**
 * 비교 바차트 렌더링
 */
function renderComparisonChart() {
  const canvas = document.getElementById('comparison-canvas');
  if (!canvas) return;

  destroyChart('comparison');

  if (state.comparisonCities.length === 0) {
    canvas.parentElement && (canvas.parentElement.style.display = 'none');
    return;
  }

  if (canvas.parentElement) canvas.parentElement.style.display = 'block';

  // 카테고리 점수 비교
  const labels = state.comparisonCities.map(id => CITIES[id] ? CITIES[id].name : id);
  const catColors = {
    samlter: 'rgba(52,152,219,0.75)',
    ilter:   'rgba(230,126,34,0.75)',
    shimter:  'rgba(39,174,96,0.75)',
  };

  const datasets = [
    { label: '삶터', data: state.comparisonCities.map(id => +calcCategoryScore(id, 'samlter').toFixed(1)), backgroundColor: catColors.samlter },
    { label: '일터', data: state.comparisonCities.map(id => +calcCategoryScore(id, 'ilter').toFixed(1)),   backgroundColor: catColors.ilter   },
    { label: '쉼터', data: state.comparisonCities.map(id => +calcCategoryScore(id, 'shimter').toFixed(1)),  backgroundColor: catColors.shimter  },
  ];

  state.charts.comparison = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: '점수 (0~100)', font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
        x: {
          grid: { display: false },
        },
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 11 }, boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.raw}점`,
          },
        },
      },
    },
  });
}

// ===================================================================
// === 시나리오 분석 ===
// ===================================================================

/**
 * 시나리오 패널 초기화 (슬라이더 생성)
 */
function initScenario() {
  const panel = document.getElementById('scenario-panel');
  if (!panel) return;

  // 슬라이더 영역 생성
  const slidersHtml = SCENARIO_LEVERS.map(lever => `
    <div class="scenario-lever" id="lever-${lever.id}">
      <div class="lever-header">
        <label class="lever-label" for="slider-${lever.id}">${lever.label}</label>
        <span class="lever-value-display" id="display-${lever.id}">0 ${lever.unit}</span>
      </div>
      <input
        type="range"
        id="slider-${lever.id}"
        class="lever-slider"
        min="${lever.min}"
        max="${lever.max}"
        step="${lever.step}"
        value="0"
      />
      <div class="lever-range-labels">
        <span>${lever.min} ${lever.unit}</span>
        <span>${lever.max} ${lever.unit}</span>
      </div>
      <div class="lever-desc">${lever.description}</div>
    </div>
  `).join('');

  panel.innerHTML = `
    <h3 class="section-title">시나리오 분석</h3>
    <p class="scenario-guide">정책 투입 값을 조정하면 지표 변화를 시뮬레이션합니다.<br>(남양주 자율지표 기반 시나리오)</p>
    <div class="scenario-levers">
      ${slidersHtml}
    </div>
    <div class="scenario-charts-wrapper">
      <div class="scenario-chart-block">
        <h4 class="scenario-chart-title">현재 상태</h4>
        <canvas id="scenario-before" height="220"></canvas>
      </div>
      <div class="scenario-arrow">→</div>
      <div class="scenario-chart-block">
        <h4 class="scenario-chart-title">시나리오 적용 후</h4>
        <canvas id="scenario-after" height="220"></canvas>
      </div>
    </div>
    <div class="scenario-delta-table" id="scenario-delta-table"></div>
  `;

  // 슬라이더 이벤트 등록
  SCENARIO_LEVERS.forEach(lever => {
    const slider  = document.getElementById(`slider-${lever.id}`);
    const display = document.getElementById(`display-${lever.id}`);
    if (!slider || !display) return;

    slider.addEventListener('input', () => {
      state.scenarioValues[lever.id] = parseFloat(slider.value);
      display.textContent = `${slider.value} ${lever.unit}`;
      if (state.selectedCity) {
        renderScenarioCharts(state.selectedCity);
      }
    });
  });
}

/**
 * 시나리오 적용된 값 계산
 * @param {string} cityId
 * @returns {{ before: object, after: object }} 자율지표 값 (before/after)
 */
function calcScenarioValues(cityId) {
  const city = CITIES[cityId];
  if (!city) return { before: {}, after: {} };

  // 베이스 값: 남양주 자율지표 + 시나리오 레버가 영향을 주는 공통지표
  const base = {};

  Object.keys(JAYUL_INDICATORS_POOL).forEach(k => {
    base[k] = (city.jayulIndicators?.[k] !== undefined && city.jayulIndicators[k] !== null)
      ? city.jayulIndicators[k]
      : 0;
  });

  // 레버가 영향을 주는 공통지표도 포함 (예: L4)
  SCENARIO_LEVERS.forEach(lever => {
    const key = lever.affectsIndicator;
    if (base[key] === undefined) {
      base[key] = city.indicators[key] !== undefined ? city.indicators[key] : 0;
    }
  });

  const after = { ...base };
  SCENARIO_LEVERS.forEach(lever => {
    const inputVal = state.scenarioValues[lever.id] || 0;
    const delta    = inputVal * lever.effectPerUnit;
    const key      = lever.affectsIndicator;
    if (after[key] !== undefined) {
      after[key] = after[key] + delta;
    }
  });

  return { before: base, after };
}

/**
 * 시나리오 레이더 차트 렌더링
 * @param {string} cityId
 */
function renderScenarioCharts(cityId) {
  const { before, after } = calcScenarioValues(cityId);

  // 레이더 차트는 남양주 자율지표 8개만 표시 (해석 용이)
  const labels = Object.values(JAYUL_INDICATORS_POOL).map(i => i.name);
  const beforeVals = Object.keys(JAYUL_INDICATORS_POOL).map(k => before[k] || 0);
  const afterVals  = Object.keys(JAYUL_INDICATORS_POOL).map(k => after[k] || 0);

  // 공통 최대값 (정규화 기준)
  const maxVals = Object.keys(JAYUL_INDICATORS_POOL).map((k, i) =>
    Math.max(beforeVals[i], afterVals[i], 1) * 1.2
  );
  const maxVal = Math.max(...maxVals, 1);

  // Before 차트
  destroyChart('scenarioBefore');
  const beforeCanvas = document.getElementById('scenario-before');
  if (beforeCanvas) {
    state.charts.scenarioBefore = new Chart(beforeCanvas, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: '현재',
          data: beforeVals,
          borderColor: 'rgba(52,152,219,0.9)',
          backgroundColor: 'rgba(52,152,219,0.2)',
          borderWidth: 2,
          pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: { r: { min: 0, suggestedMax: maxVal, ticks: { font: { size: 9 } }, pointLabels: { font: { size: 10 } } } },
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
      },
    });
  }

  // After 차트
  destroyChart('scenarioAfter');
  const afterCanvas = document.getElementById('scenario-after');
  if (afterCanvas) {
    state.charts.scenarioAfter = new Chart(afterCanvas, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: '시나리오 적용',
          data: afterVals,
          borderColor: 'rgba(230,126,34,0.9)',
          backgroundColor: 'rgba(230,126,34,0.2)',
          borderWidth: 2,
          pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: { r: { min: 0, suggestedMax: maxVal, ticks: { font: { size: 9 } }, pointLabels: { font: { size: 10 } } } },
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
      },
    });
  }

  // 변화량 테이블
  renderScenarioDeltaTable(before, after);
}

/**
 * 시나리오 변화량 테이블 렌더링
 * @param {object} before
 * @param {object} after
 */
function renderScenarioDeltaTable(before, after) {
  const container = document.getElementById('scenario-delta-table');
  if (!container) return;

  // 베이스에 포함된 모든 지표 표시 (남양주 자율지표 + 레버가 건드리는 공통지표)
  const allIndicators = { ...INDICATORS, ...JAYUL_INDICATORS_POOL };
  const keys = Object.keys(before).filter(k => allIndicators[k]);

  const rows = keys.map(key => {
    const ind = allIndicators[key];
    const bv = before[key] || 0;
    const av = after[key]  || 0;
    const delta = av - bv;
    const changed = Math.abs(delta) > 0.001;
    return `
      <tr class="${changed ? 'delta-changed' : ''}">
        <td class="delta-key">${key}</td>
        <td class="delta-name">${ind.name}</td>
        <td class="delta-before">${bv.toFixed(2)} ${ind.unit}</td>
        <td class="delta-after">${av.toFixed(2)} ${ind.unit}</td>
        <td class="delta-value ${delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : ''}">
          ${delta === 0 ? '-' : (delta > 0 ? '+' : '') + delta.toFixed(2) + ' ' + ind.unit}
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <h4 class="delta-title">지표 변화량</h4>
    <table class="delta-table">
      <thead>
        <tr>
          <th>코드</th><th>지표명</th><th>현재</th><th>변화 후</th><th>변화량</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ===================================================================
// === 기능별 분석 — 산점도 / 히트맵 ===
// ===================================================================

let analysisChart = null;
let analysisCurrentPurpose = 'pass-through';

/**
 * 분석 뷰 초기화 — 탭 진입 시 호출 (이벤트는 한 번만 바인딩)
 */
function initAnalysisView() {
  const root = document.getElementById('analysis-container');
  if (!root) return;
  if (!root.dataset.bound) {
    root.querySelectorAll('.analysis-purpose-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const purpose = btn.dataset.purpose;
        if (!purpose || !ANALYSIS_PURPOSES[purpose]) return;
        root.querySelectorAll('.analysis-purpose-tab').forEach(t => t.classList.remove('is-active'));
        btn.classList.add('is-active');
        switchAnalysisPurpose(purpose);
      });
    });
    root.dataset.bound = '1';
  }
  switchAnalysisPurpose(analysisCurrentPurpose);
}

/**
 * 분석 목적 전환 — 해석 패널 갱신 + 차트 다시 그리기
 */
function switchAnalysisPurpose(key) {
  const cfg = ANALYSIS_PURPOSES[key];
  if (!cfg) return;
  analysisCurrentPurpose = key;

  const titleEl = document.getElementById('analysis-interpret-title');
  const descEl  = document.getElementById('analysis-interpret-desc');
  const axisUl  = document.getElementById('analysis-axis-info');
  const howEl   = document.getElementById('analysis-howto');
  const legendEl = document.getElementById('analysis-color-legend');
  if (titleEl) titleEl.textContent = cfg.title;
  if (descEl)  descEl.textContent  = cfg.description;

  if (cfg.vizType === 'scatter') {
    // 사분면 라벨 색을 차트와 동기화
    if (axisUl) {
      axisUl.innerHTML = [
        `<li class="axis-info-axis"><b>X축</b> · ${cfg.axes.x.label}<br><span class="axis-info-explain">${cfg.axes.x.explain}</span></li>`,
        `<li class="axis-info-axis"><b>Y축</b> · ${cfg.axes.y.label}<br><span class="axis-info-explain">${cfg.axes.y.explain}</span></li>`,
        `<li class="quad-legend quad-legend--upperRight"><span class="quad-dot"></span>우상단 — 정주·자립형</li>`,
        `<li class="quad-legend quad-legend--lowerRight"><span class="quad-dot"></span>우하단 — <b>통과형</b> (집중 모니터링)</li>`,
        `<li class="quad-legend quad-legend--upperLeft"><span class="quad-dot"></span>좌상단 — 안정 보전형</li>`,
        `<li class="quad-legend quad-legend--lowerLeft"><span class="quad-dot"></span>좌하단 — 쇠퇴 주의</li>`,
      ].join('');
    }
    if (howEl) {
      howEl.innerHTML = `
        <h4>이렇게 읽으세요</h4>
        <ol>
          <li>사분면 배경색이 4가지 시군 유형 영역</li>
          <li>점선은 15개 시군 X·Y 값의 중앙값</li>
          <li>점 색이 그 시군이 속한 사분면 유형</li>
          <li>주황색(우하단)이 통과형 후보 시군</li>
        </ol>`;
    }
    if (legendEl) legendEl.style.display = 'none';
    renderAnalysisScatter(cfg);
  } else if (cfg.vizType === 'heatmap') {
    if (axisUl) {
      axisUl.innerHTML = cfg.indicators.map(k => {
        const def = INDICATORS[k] || JAYUL_INDICATORS_POOL[k];
        const cat = def?.category || '';
        return `<li class="axis-info-indicator axis-info-indicator--${cat}"><b>${k}</b> · ${def ? def.name : k}</li>`;
      }).join('');
    }
    if (howEl) {
      howEl.innerHTML = `
        <h4>이렇게 읽으세요</h4>
        <ol>
          <li>시군은 6개 지표 종합 점수 높은 순으로 정렬</li>
          <li>한 행이 균일하게 진하면 다방면에서 강세 → 체류 전환 잠재력 ↑</li>
          <li>컬럼 헤더 색이 카테고리 (🔵삶터 🟠일터 🟢쉼터)</li>
          <li>맨 오른쪽 "종합" 열에서 총점 비교</li>
        </ol>`;
    }
    if (legendEl) legendEl.style.display = '';
    renderAnalysisHeatmap(cfg);
  }
}

function destroyAnalysisChart() {
  if (analysisChart) {
    try { analysisChart.destroy(); } catch (_) {}
    analysisChart = null;
  }
}

// 사분면 색상 팔레트 (산점도)
const QUADRANT_COLORS = {
  upperRight: { fill: '#52A866', bg: 'rgba(82, 168, 102, 0.10)',  border: '#3B8A4E', label: '정주·자립형' },
  lowerRight: { fill: '#E08A4A', bg: 'rgba(224, 138, 74, 0.13)',  border: '#C56F2E', label: '통과형' },
  upperLeft:  { fill: '#4A90D9', bg: 'rgba(74, 144, 217, 0.10)',  border: '#3673BC', label: '안정 보전형' },
  lowerLeft:  { fill: '#8C8C8C', bg: 'rgba(140, 140, 140, 0.10)', border: '#666666', label: '쇠퇴 주의' },
};

function _quadrantOf(x, y, xMed, yMed) {
  const isRight = x >= xMed;
  const isUpper = y >= yMed;
  return isRight ? (isUpper ? 'upperRight' : 'lowerRight') : (isUpper ? 'upperLeft' : 'lowerLeft');
}

function _median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * 산점도 렌더 — 사분면 배경/기준선/색구분/이름표 모두 포함
 */
function renderAnalysisScatter(cfg) {
  destroyAnalysisChart();
  const canvas = document.getElementById('analysis-canvas');
  if (!canvas) return;

  // 데이터 + 사분면 분류
  const data = Object.entries(CITIES).map(([cityId, city]) => ({
    cityId,
    x: city.indicators[cfg.axes.x.key],
    y: city.indicators[cfg.axes.y.key],
    cityName: city.name,
  })).filter(p => p.x != null && p.y != null);

  const xMed = _median(data.map(d => d.x));
  const yMed = _median(data.map(d => d.y));
  data.forEach(d => { d.quadrant = _quadrantOf(d.x, d.y, xMed, yMed); });

  // 차트 영역 외부 플러그인 — 사분면 배경, 기준선, 이름표
  const quadrantPlugin = {
    id: 'analysisScatterQuadrants',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const xPx = scales.x.getPixelForValue(xMed);
      const yPx = scales.y.getPixelForValue(yMed);
      const left = chartArea.left, right = chartArea.right;
      const top  = chartArea.top,  bot   = chartArea.bottom;
      ctx.save();
      // 4 사분면 배경
      ctx.fillStyle = QUADRANT_COLORS.upperRight.bg;
      ctx.fillRect(xPx, top, right - xPx, yPx - top);
      ctx.fillStyle = QUADRANT_COLORS.lowerRight.bg;
      ctx.fillRect(xPx, yPx, right - xPx, bot - yPx);
      ctx.fillStyle = QUADRANT_COLORS.upperLeft.bg;
      ctx.fillRect(left, top, xPx - left, yPx - top);
      ctx.fillStyle = QUADRANT_COLORS.lowerLeft.bg;
      ctx.fillRect(left, yPx, xPx - left, bot - yPx);
      // 중앙값 기준선 (점선)
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(xPx, top); ctx.lineTo(xPx, bot);
      ctx.moveTo(left, yPx); ctx.lineTo(right, yPx);
      ctx.stroke();
      ctx.setLineDash([]);
      // 사분면 라벨 (구석)
      ctx.font = 'bold 11px "Noto Sans KR", sans-serif';
      ctx.textBaseline = 'top';
      const pad = 6;
      ctx.fillStyle = QUADRANT_COLORS.upperRight.border;
      ctx.textAlign = 'right'; ctx.fillText('정주·자립형', right - pad, top + pad);
      ctx.fillStyle = QUADRANT_COLORS.lowerRight.border;
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('🚦 통과형', right - pad, bot - pad);
      ctx.fillStyle = QUADRANT_COLORS.upperLeft.border;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('안정 보전형', left + pad, top + pad);
      ctx.fillStyle = QUADRANT_COLORS.lowerLeft.border;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('쇠퇴 주의', left + pad, bot - pad);
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      // 시군명 라벨 — 점 옆에
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta) return;
      ctx.save();
      ctx.font = '11px "Noto Sans KR", sans-serif';
      ctx.textBaseline = 'middle';
      meta.data.forEach((pt, i) => {
        const raw = chart.data.datasets[0].data[i];
        if (!raw) return;
        const isFocal = raw.cityId === 'namyangju';
        ctx.fillStyle = isFocal ? '#000' : 'rgba(40, 50, 45, 0.85)';
        ctx.font = isFocal ? 'bold 12px "Noto Sans KR", sans-serif' : '11px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(raw.cityName, pt.x + 10, pt.y);
      });
      ctx.restore();
    },
  };

  analysisChart = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: cfg.label,
        data,
        backgroundColor: (ctx) => {
          const r = ctx.raw;
          if (!r) return '#999';
          return QUADRANT_COLORS[r.quadrant].fill;
        },
        borderColor: (ctx) => {
          const r = ctx.raw;
          if (!r) return '#666';
          if (r.cityId === 'namyangju') return '#000';
          return QUADRANT_COLORS[r.quadrant].border;
        },
        borderWidth: (ctx) => (ctx.raw?.cityId === 'namyangju' ? 2.5 : 1.5),
        pointRadius: (ctx) => (ctx.raw?.cityId === 'namyangju' ? 10 : 8),
        pointHoverRadius: 12,
        pointStyle: (ctx) => (ctx.raw?.cityId === 'namyangju' ? 'rectRot' : 'circle'),
      }],
    },
    options: {
      maintainAspectRatio: false,
      layout: { padding: { right: 40 } },
      scales: {
        x: {
          title: { display: true, text: cfg.axes.x.label, font: { weight: '600', size: 13 } },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
        y: {
          title: { display: true, text: cfg.axes.y.label, font: { weight: '600', size: 13 } },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.raw?.cityName || '',
            label: (ctx) => {
              const r = ctx.raw;
              return [
                `${cfg.axes.x.label}: ${r.x}`,
                `${cfg.axes.y.label}: ${r.y}`,
                `유형: ${QUADRANT_COLORS[r.quadrant].label}`,
              ];
            },
          },
        },
      },
    },
    plugins: [quadrantPlugin],
  });
}

/**
 * 히트맵 렌더 — 시군 정렬 + 셀 점수 + 카테고리 색 + 종합 열
 */
function renderAnalysisHeatmap(cfg) {
  destroyAnalysisChart();
  const canvas = document.getElementById('analysis-canvas');
  if (!canvas) return;
  if (typeof Chart === 'undefined' || !Chart.registry.controllers.get('matrix')) {
    canvas.getContext('2d').fillText('matrix 플러그인이 로드되지 않았습니다', 20, 30);
    return;
  }

  const allCityIds = Object.keys(CITIES);

  // 정규화 함수 — 0~1, higherBetter 반전
  const normForCity = (cityId, indKey) => {
    const range = getIndicatorRange(indKey);
    const ind   = INDICATORS[indKey] || JAYUL_INDICATORS_POOL[indKey];
    const raw   = CITIES[cityId].indicators[indKey];
    if (raw == null) return null;
    let norm = (raw - range.min) / (range.max - range.min + 1e-9);
    norm = Math.max(0, Math.min(1, norm));
    if (ind && !ind.higherBetter) norm = 1 - norm;
    return { norm, raw };
  };

  // 시군별 6 지표 평균 → 정렬
  const cityScored = allCityIds.map(cityId => {
    const scores = cfg.indicators.map(k => normForCity(cityId, k)).filter(s => s != null);
    const avg = scores.length ? scores.reduce((a, b) => a + b.norm, 0) / scores.length : 0;
    return { cityId, name: CITIES[cityId].name, avg };
  }).sort((a, b) => b.avg - a.avg);

  const sortedNames = cityScored.map(c => c.name);

  // 컬럼 = 지표 + 마지막 "종합" 열
  const TOTAL_KEY = '__total__';
  const colKeys = [...cfg.indicators, TOTAL_KEY];

  // 셀 데이터
  const cells = [];
  cityScored.forEach(({ cityId, name, avg }) => {
    cfg.indicators.forEach(indKey => {
      const s = normForCity(cityId, indKey);
      if (!s) return;
      cells.push({ x: indKey, y: name, v: s.norm, raw: s.raw, isTotal: false });
    });
    cells.push({ x: TOTAL_KEY, y: name, v: avg, raw: avg * 100, isTotal: true });
  });

  // 값 그리기 플러그인
  const valuePlugin = {
    id: 'analysisHeatmapValues',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta) return;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      meta.data.forEach((cell, i) => {
        const d = chart.data.datasets[0].data[i];
        if (!d) return;
        const score = Math.round(d.v * 100);
        ctx.font = d.isTotal ? 'bold 12px "Noto Sans KR", sans-serif' : '11px "Noto Sans KR", sans-serif';
        ctx.fillStyle = d.v > 0.55 ? '#fff' : '#2D5F3F';
        ctx.fillText(String(score), cell.x, cell.y);
      });
      ctx.restore();
    },
  };

  analysisChart = new Chart(canvas, {
    type: 'matrix',
    data: {
      datasets: [{
        label: cfg.label,
        data: cells,
        backgroundColor: (c) => {
          const r = c.raw || {};
          const v = typeof r.v === 'number' ? r.v : 0;
          if (r.isTotal) {
            // 종합 열은 액센트 색조
            return `rgba(212, 165, 116, ${0.18 + v * 0.7})`;
          }
          return `rgba(45, 95, 63, ${0.10 + v * 0.78})`;
        },
        borderColor: (c) => (c.raw?.isTotal ? 'rgba(196, 138, 70, 0.6)' : 'rgba(255,255,255,0.7)'),
        borderWidth: (c) => (c.raw?.isTotal ? 1.5 : 1),
        width:  ({ chart }) => {
          const a = chart.chartArea;
          return a ? (a.right - a.left) / colKeys.length - 2 : 30;
        },
        height: ({ chart }) => {
          const a = chart.chartArea;
          return a ? (a.bottom - a.top) / sortedNames.length - 2 : 18;
        },
      }],
    },
    options: {
      maintainAspectRatio: false,
      layout: { padding: { left: 4, right: 4, top: 4, bottom: 4 } },
      scales: {
        x: {
          type: 'category', labels: colKeys, position: 'top',
          grid: { display: false },
          ticks: {
            font: { weight: '700', size: 12 },
            color: (ctx) => {
              const key = colKeys[ctx.index];
              if (key === TOTAL_KEY) return '#C56F2E';
              const def = INDICATORS[key] || JAYUL_INDICATORS_POOL[key];
              if (def?.category === 'samlter') return '#3673BC';
              if (def?.category === 'ilter')   return '#C56F2E';
              if (def?.category === 'shimter') return '#3B8A4E';
              return '#444';
            },
            callback: (val, idx) => (colKeys[idx] === TOTAL_KEY ? '종합' : colKeys[idx]),
          },
        },
        y: {
          type: 'category', labels: sortedNames, reverse: true,
          grid: { display: false },
          ticks: { font: { size: 11.5, weight: '500' } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: () => '',
            label: (ctx) => {
              const r = ctx.raw || {};
              if (r.isTotal) return `${r.y} · 종합 ${Math.round(r.v * 100)}점`;
              const def = INDICATORS[r.x] || JAYUL_INDICATORS_POOL[r.x];
              const name = def ? def.name : r.x;
              return `${r.y} · ${name} · ${Math.round(r.v * 100)}점 (원값 ${r.raw})`;
            },
          },
        },
      },
    },
    plugins: [valuePlugin],
  });
}

// ===================================================================
// === 지역 드릴다운 — 시군 → 읍면 (행정리는 Phase 2) ===
// ===================================================================

// 읍면 일반정보 캐시 (adm_cd → info)
const DONG_INFO_CACHE = {};

/**
 * 읍면 일반정보 결정론적 mock 생성
 * — 농촌다움 지표가 아닌 "지역 메타정보" (인구·면적·특성 등)
 */
function getDongInfo(admCd, admNm, cityId) {
  if (DONG_INFO_CACHE[admCd]) return DONG_INFO_CACHE[admCd];

  // region-meta.dong 3-layer 캐시 우선 사용
  const meta = regionMeta && regionMeta.dong && regionMeta.dong[admCd];
  const readDongValue = (keys) => {
    if (!meta) return undefined;
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      const rec = (meta.computed && meta.computed[key]) ||
                  (meta.raw && meta.raw[key]) ||
                  (meta.manual && meta.manual[key]);
      if (rec && rec.value != null) return rec.value;
    }
    return undefined;
  };
  const readDongSource = () => {
    if (!meta || !meta.raw) return 'mock';
    const sources = Object.values(meta.raw)
      .map(rec => rec && rec.source)
      .filter(Boolean);
    if (sources.some(src => String(src).startsWith('sgis:'))) return 'sgis';
    if (sources.some(src => String(src).startsWith('kosis:'))) return 'kosis';
    if (sources.some(src => String(src).startsWith('boundary:'))) return 'boundary';
    return sources.length ? 'mixed' : 'mock';
  };
  const seed = parseInt(String(admCd).slice(-4), 10) || 0;
  const rng = (mod) => Math.abs(((seed * 9301 + 49297) % 233280)) % mod;
  const rng2 = (mod) => Math.abs((((seed + 17) * 1103515245 + 12345) % 2147483648)) % mod;
  const rng3 = (mod) => Math.abs(((seed * 31 + 7919) ^ 0x5A5A5A) % mod);
  const city = CITIES[cityId];
  const landMixes = ['주거 중심', '농업 중심', '복합형', '관광·휴양', '산업 단지 인접'];
  const characters = [
    '도시 접근성 우수, 베드타운 성격',
    '평야 농업지대, 곡창 역할',
    '산림·계곡 풍부, 자연환경 강세',
    '도농 혼재, 신규 개발 활발',
    '전통 농촌, 고령 인구 비중 높음',
    '하천 인접, 수변 자원 보유',
  ];
  const hasMeta = !!meta;
  const metaName = readDongValue('adm_nm');
  const metaCityId = readDongValue('city_id');
  const resolvedCityId = metaCityId || cityId;
  const resolvedCity = CITIES[resolvedCityId] || city;
  // 시뮬레이션 마이크로데이터 (피드백 #7) — 현재 namyangju 만 지원
  const simEntry = (simulationData && simulationData.dongs && simulationData.dongs[admCd]) || null;
  const info = {
    admCd,
    admNm: metaName || admNm,
    cityId: resolvedCityId,
    cityName: (resolvedCity && resolvedCity.name) || resolvedCityId,
    cityType: (resolvedCity && resolvedCity.type) || '',
    population:  readDongValue(['population', 'tot_ppltn']) || (hasMeta ? null : 2000 + rng(18000)),
    area:        readDongValue('area') || (hasMeta ? null : (5 + (rng2(85) / 10)).toFixed(1)),
    households:  readDongValue(['households', 'tot_family']) || (hasMeta ? null : 800 + rng3(7200)),
    landMix:     readDongValue('landMix') || landMixes[rng(landMixes.length)],
    character:   readDongValue('character') || characters[rng2(characters.length)],
    _source:     simEntry ? 'simulation' : readDongSource(),
    simulation:  simEntry || null,
  };
  DONG_INFO_CACHE[admCd] = info;
  return info;
}

/**
 * 시뮬레이션 데이터에서 특정 dong 의 지표 블록 반환 (피드백 #7)
 * @param {string} admCd 행정코드
 * @returns {{adm_nm:string, cluster:string, indicators:Object}|null}
 */
function getSimulationDongIndicators(admCd) {
  if (!simulationData || !simulationData.dongs) return null;
  return simulationData.dongs[admCd] || null;
}

/**
 * 시뮬레이션 데이터의 모든 dong 목록을 배열로 반환 (피드백 #7 — 읍면 비교 UI 기반)
 * @returns {Array<{admCd:string, adm_nm:string, cluster:string, indicators:Object}>}
 */
function listSimulationDongs() {
  if (!simulationData || !simulationData.dongs) return [];
  return Object.entries(simulationData.dongs).map(([admCd, entry]) => ({
    admCd,
    adm_nm: entry.adm_nm,
    cluster: entry.cluster,
    indicators: entry.indicators,
  }));
}

// ===================================================================
// === 지표 ID 정규화 + 읍면 지표 병합 레이어 (0531 통합) ===
// ===================================================================
// 배경: 4개 자료의 지표 ID가 서로 어긋난다. 표준(CANON)=xlsx 확정안/docx 기준.
//  - CANON: W9=농촌체험, R4=양호수질하천, R5=수변생태쉼터, R6=도시텃밭수용, R7=주말농원
//  - mock(namyangju-dong-mock): 키가 한 칸 밀림 → 변환 필수
//  - CITIES.namyangju.jayulIndicators: 앱 내부 번호(R4=체험·R5=수질·R6=쉼터) → 변환 필수
// 직접 키 접근 금지. 반드시 아래 변환 레이어 경유.

// CANON → mock(namyangju-dong-mock.json) 키
const CANON_TO_MOCK = {
  L1: 'L1_pop_growth', L4: 'L4_living_soc', W2: 'W2_business_density',
  W6: 'W6_young_return', W7: 'W7_eco_farm', R3: 'R3_green_ratio',
  W9: 'R4_experience_prog', R4: 'R5_water_quality', R5: 'R6_park_per_capita',
};
// CANON → CITIES.jayulIndicators / indicator-reference.json key (R블록만 다름)
const CANON_TO_REF = { W9: 'R4', R4: 'R5', R5: 'R6' };
// CITIES.namyangju 에 없는 시군 단위 보조값 (HTML 프로토타입 기준)
const SIGUN_EXTRA = { namyangju: { L7: 8 } }; // L7=의료시설 경기 8위(시군 고정)

/** indicator-reference.json 메타 조회 (CANON → ref key). 없으면 null. */
function refMeta(canon) {
  if (!indicatorReference) return null;
  const inds = indicatorReference.indicators || indicatorReference;
  const k = CANON_TO_REF[canon] || canon;
  return (inds && inds[k]) || null;
}

/** 시군(남양주) 단위 CANON 지표값 — CITIES mock에서 조회 (읍면 fallback 최하단) */
function getSigunCanonValue(cityId, canon) {
  const c = (typeof CITIES !== 'undefined') && CITIES[cityId];
  if (!c) return undefined;
  if (c.indicators && c.indicators[canon] != null) return c.indicators[canon];
  const jk = CANON_TO_REF[canon] || canon;
  if (c.jayulIndicators && c.jayulIndicators[jk] != null) return c.jayulIndicators[jk];
  const extra = SIGUN_EXTRA[cityId];
  if (extra && extra[canon] != null) return extra[canon];
  return undefined;
}

/**
 * 읍면 단위 CANON 지표값을 출처 우선순위로 병합 조회.
 * 우선순위: field-survey(현장조사) > simulation(mock) > sigun(시군 고정값)
 * @param {string} eupName  읍면명 (예: '조안면')
 * @param {string} canon    CANON 지표 키 (예: 'W9')
 * @returns {{value:number|null, source:'field'|'sim'|'sigun', unit:string, label:string, n?:number, pending?:boolean}|null}
 */
function getEupIndicator(eupName, canon) {
  // 1) 현장조사 (9개 농촌 읍면만)
  const fs = fieldSurveyData && fieldSurveyData.eups && fieldSurveyData.eups[eupName];
  if (fs && fs.indicators && fs.indicators[canon]) {
    const r = fs.indicators[canon];
    return { value: r.value, source: 'field', unit: r.unit || '', label: r.label || canon, n: r.n, pending: !!r._pending };
  }
  // 2) 시뮬레이션 mock (16개 읍면동) — adm_cd로 조회
  const admCd = fs ? fs.adm_cd : eupNameToAdmCd(eupName);
  const mockKey = CANON_TO_MOCK[canon];
  if (admCd && mockKey) {
    const sim = getSimulationDongIndicators(admCd);
    if (sim && sim.indicators && sim.indicators[mockKey] && sim.indicators[mockKey].value != null) {
      const r = sim.indicators[mockKey];
      return { value: r.value, source: 'sim', unit: r.unit || '', label: r.label || canon };
    }
  }
  // 3) 시군 고정값 (전 읍면 동일)
  const sv = getSigunCanonValue('namyangju', canon);
  if (sv != null) {
    const m = refMeta(canon);
    return { value: sv, source: 'sigun', unit: (m && m.unit) || '', label: (m && m.name) || canon };
  }
  return null;
}

/** 읍면명 → adm_cd (simulationData 역조회) */
function eupNameToAdmCd(eupName) {
  if (!simulationData || !simulationData.dongs) return null;
  const hit = Object.entries(simulationData.dongs).find(([, e]) => e.adm_nm === eupName);
  return hit ? hit[0] : null;
}

/**
 * 읍면의 모든 CANON 지표를 평탄한 dict로 반환 (트리거 엔진·비전 점수 입력용).
 * { L1: 0.8, L4: 58.3, ..., _src: { L1:'sigun', L4:'field', ... } }
 */
function getEupAllIndicators(eupName) {
  const CANON_KEYS = ['L1','L2','L3','L4','L5','L6','L7','L8','W1','W2','W3','W4','W5','W6','W7','W8','W9','R1','R2','R3','R4','R5','R6','R7','R8'];
  const out = { _src: {} };
  CANON_KEYS.forEach(k => {
    const r = getEupIndicator(eupName, k);
    if (r && r.value != null) { out[k] = r.value; out._src[k] = r.source; }
  });
  return out;
}

// ===================================================================
// === 트리거 엔진 → 시사점 카드 (#3, 0531 — 김선혁 HTML 포팅) ===
// ===================================================================
// namyangju-triggers.json 의 15개 트리거 규칙을 읍면 지표에 평가하여
// 발화(fired) 트리거를 찾고, 그에 대응하는 정책 시사점 카드를 생성한다.

const NYJ_CARD_COLORS = {
  red:   { bd: '#FECACA', bg: '#FFF5F5', tx: '#7F1D1D', bar: '#EF4444', vbd: '#B5182B' },
  amber: { bd: '#FDE68A', bg: '#FFFBEB', tx: '#78350F', bar: '#F59E0B', vbd: '#D97706' },
  green: { bd: '#A7F3D0', bg: '#F0FDF4', tx: '#14532D', bar: '#10B981', vbd: '#2D6A4F' },
  blue:  { bd: '#BFDBFE', bg: '#EFF6FF', tx: '#1E3A5F', bar: '#3B82F6', vbd: '#1D5FA6' },
  gray:  { bd: '#E2E8F0', bg: '#F9FAFB', tx: '#374151', bar: '#9CA3AF', vbd: '#9CA3AF' },
};
const NYJ_THE_TAG = {
  T: { bg: '#DBEAFE', tx: '#1E40AF' }, H: { bg: '#FEF3C7', tx: '#92400E' },
  E: { bg: '#D1FAE5', tx: '#065F46' }, 'H+T': { bg: '#FEE2E2', tx: '#991B1B' }, '—': { bg: '#F3F4F6', tx: '#6B7280' },
};

/** 단일 조건 {k,op,v} 평가. 값 없으면 false. */
function evalCond(cond, data) {
  const x = data[cond.k];
  if (x == null) return false;
  switch (cond.op) {
    case '<':  return x <  cond.v;
    case '<=': return x <= cond.v;
    case '>':  return x >  cond.v;
    case '>=': return x >= cond.v;
    case '==': return x === cond.v;
    case '!=': return x !== cond.v;
    default:   return false;
  }
}

/** rule {all:[...]} / {any:[...]} 재귀 평가. */
function evalRule(rule, data) {
  if (!rule) return false;
  if (rule.all) return rule.all.every(c => (c.all || c.any) ? evalRule(c, data) : evalCond(c, data));
  if (rule.any) return rule.any.some(c => (c.all || c.any) ? evalRule(c, data) : evalCond(c, data));
  return false;
}

/** 발화 트리거 ID 배열 반환. */
function firedTriggerIds(data) {
  if (!triggerConfig || !triggerConfig.triggers) return [];
  return triggerConfig.triggers.filter(t => evalRule(t.rule, data)).map(t => t.id);
}

/** "{name} ... {L1}%" 템플릿 치환. */
function interpolateCard(tpl, name, data) {
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (m, key) => {
    if (key === 'name') return name;
    const v = data[key];
    return (v == null) ? '–' : v;
  });
}

/** 발화 트리거에 매칭되는 시사점 카드 목록 생성 (HTML getCards 로직 재현). */
function buildInsightCards(name, data, firedIds) {
  if (!triggerConfig || !triggerConfig.cards) return [];
  const firedSet = new Set(firedIds);
  const out = [];
  triggerConfig.cards.forEach(card => {
    if (card.fallback) return; // 폴백은 마지막에 별도 처리
    const whenOk = (card.when || []).some(id => firedSet.has(id));
    const notOk = !(card.not || []).some(id => firedSet.has(id));
    if (whenOk && notOk) out.push(card);
  });
  if (out.length === 0) {
    const fb = triggerConfig.cards.find(c => c.fallback);
    if (fb) out.push(fb);
  }
  return out;
}

/** 트리거 그리드 + 시사점 카드를 읍면 패널에 렌더. */
function renderEupTriggerCards(eupName) {
  const gridHost = document.getElementById('eup-trigger-grid');
  const cardHost = document.getElementById('eup-insight-cards');
  if (!gridHost || !cardHost) return;
  if (!triggerConfig) { gridHost.innerHTML = ''; cardHost.innerHTML = ''; return; }

  const data = getEupAllIndicators(eupName);
  const firedIds = firedTriggerIds(data);
  const firedSet = new Set(firedIds);

  // 1) 트리거 그리드 (15개, 발화/비활성)
  const gridItems = triggerConfig.triggers.map(t => {
    const fired = firedSet.has(t.id);
    const c = fired ? t.color : 'gray';
    const num = t.id.replace('TC-', '');
    return `<div class="nyj-trigger-card ${fired ? 'fired fired-' + t.color : 'muted'}">
      <div class="nyj-t-num ${c}">${num}</div>
      <div class="nyj-t-body">
        <div class="nyj-t-name ${c}">${t.name}</div>
        <div class="nyj-t-cond">${t.cond}</div>
      </div></div>`;
  }).join('');
  gridHost.innerHTML = `
    <div class="nyj-section-label">트리거 조건 평가 <span class="nyj-fired-count">${firedIds.length} / 15 발화</span></div>
    <div class="nyj-trigger-grid">${gridItems}</div>`;

  // 2) 시사점 카드
  const cards = buildInsightCards(eupName, data, firedIds);
  const cardHtml = cards.map(card => {
    const col = NYJ_CARD_COLORS[card.color] || NYJ_CARD_COLORS.gray;
    const the = NYJ_THE_TAG[card.the] || NYJ_THE_TAG['—'];
    const metrics = (card.metrics || []).map(m => {
      const r = getEupIndicator(eupName, m.k);
      const val = (r && r.value != null) ? `${r.value}${r.unit ? ' ' + r.unit : ''}` : '–';
      const srcTag = r ? `<span class="nyj-metric-src src-${r.source}">${EUP_SOURCE_BADGE[r.source]?.ko || ''}</span>` : '';
      return `<div class="nyj-metric-row">
        <span class="nyj-metric-id">${m.k}</span>
        <span class="nyj-metric-name">${m.name}${srcTag}</span>
        <span class="nyj-metric-val">${val}</span></div>`;
    }).join('');
    return `<div class="nyj-icard" style="border-color:${col.bd}">
      <div class="nyj-icard-head" style="background:${col.bg}">
        <span class="nyj-icard-icon">${card.icon || '•'}</span>
        <div class="nyj-icard-headinfo">
          <div class="nyj-icard-title" style="color:${col.tx}">${card.title}</div>
          <div class="nyj-icard-tags">
            <span class="nyj-tag" style="background:${the.bg};color:${the.tx}">${card.the} 비전</span>
            <span class="nyj-tag nyj-tag-strat">${card.strategy || ''}</span>
          </div>
        </div>
      </div>
      <div class="nyj-icard-body">
        <div class="nyj-icard-cell"><div class="nyj-cell-label">현황 지표</div>${metrics}</div>
        <div class="nyj-icard-cell"><div class="nyj-cell-label">SWOT 진단</div><div class="nyj-cell-body">${card.diagnosis || ''}</div></div>
        <div class="nyj-icard-cell full">
          <div class="nyj-cell-label">종합 판단</div>
          <div class="nyj-verdict" style="border-color:${col.vbd};background:${col.bg};color:${col.tx}">${interpolateCard(card.verdictText, eupName, data)}</div>
        </div>
        <div class="nyj-icard-cell"><div class="nyj-cell-label">정책 제안 (민선 8기 연계)</div><div class="nyj-cell-body">${card.policy || ''}</div></div>
        <div class="nyj-icard-cell"><div class="nyj-cell-label">다음 단계 (담당자 액션)</div><div class="nyj-cell-body">${card.next || ''}
          ${card.data ? `<div class="nyj-data-need"><strong>추가 필요 데이터:</strong> ${card.data}</div>` : ''}</div></div>
      </div></div>`;
  }).join('');
  cardHost.innerHTML = `
    <div class="nyj-section-label">정책 시사점 카드 <span class="nyj-fired-count">${cards.length}개</span></div>
    <div class="nyj-cards-list">${cardHtml}</div>`;
}

// ===================================================================
// === 비전 적합도 점수 (#4, 0531 — 민선8기 THE 비전 연계) ===
// ===================================================================
// 읍면 지표를 9개 농촌 읍면(+16 mock) 분포로 0~100 정규화한 뒤,
// THE 비전 3축(T/H/E) 가중평균으로 비전 적합도 점수를 산출한다.
// docx(이주영): 자원 잠재력은 높아도 시민 체감 서비스가 낮으면 비전 미달 → '잠재 vs 체감' 분리.

/** 정규화 모집단(읍면 분포) 캐시: { canonKey: [values...] } */
let _visionPopCache = null;
function getVisionPopulation() {
  if (_visionPopCache) return _visionPopCache;
  const pop = {};
  const names = [];
  if (fieldSurveyData && fieldSurveyData.eups) names.push(...Object.keys(fieldSurveyData.eups));
  if (simulationData && simulationData.dongs) {
    Object.values(simulationData.dongs).forEach(e => { if (!names.includes(e.adm_nm)) names.push(e.adm_nm); });
  }
  names.forEach(nm => {
    const d = getEupAllIndicators(nm);
    Object.keys(d).forEach(k => {
      if (k === '_src') return;
      (pop[k] = pop[k] || []).push(d[k]);
    });
  });
  _visionPopCache = pop;
  return pop;
}

const VISION_INVERSE_KEYS = new Set(['L2']); // 높을수록 나쁜 지표(노령화 등) → 반전

/** 단일 지표를 읍면 분포 min-max 로 0~100 정규화 (역방향 반전 포함). */
function normIndicator(canon, value) {
  if (value == null) return null;
  const arr = (getVisionPopulation()[canon] || []).filter(v => v != null);
  if (arr.length < 2) return 50;
  const min = Math.min(...arr), max = Math.max(...arr);
  if (max === min) return 50;
  let t = (value - min) / (max - min) * 100;
  if (VISION_INVERSE_KEYS.has(canon)) t = 100 - t;
  return Math.round(Math.max(0, Math.min(100, t)));
}

/**
 * 읍면 비전 적합도 점수.
 * @returns {{axes:{T,H,E}, overall:number, axisDetail:{}, missing:string[], potentialFelt:{potential,felt}}}
 */
function visionScore(eupName) {
  const data = getEupAllIndicators(eupName);
  const axesCfg = (triggerConfig && triggerConfig.vision_axes) || {};
  const axes = {};
  const axisDetail = {};
  const missing = [];

  Object.keys(axesCfg).forEach(axisKey => {
    const weights = axesCfg[axisKey].weights || {};
    let wsum = 0, acc = 0;
    const detail = [];
    Object.keys(weights).forEach(canon => {
      const w = Math.abs(weights[canon]);
      const norm = normIndicator(canon, data[canon]);
      if (norm == null) { missing.push(canon); return; }
      // 음수 가중치(나쁜 지표)는 normIndicator 역방향과 중복되므로 절대값만 사용
      acc += norm * w; wsum += w;
      detail.push({ k: canon, norm, weight: w });
    });
    const score = wsum > 0 ? Math.round(acc / wsum) : null;
    axes[axisKey] = score;
    axisDetail[axisKey] = detail;
  });

  const valid = Object.values(axes).filter(v => v != null);
  const overall = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;

  // 잠재 vs 체감 (docx: 자원 잠재력 vs 시민 체감 서비스)
  const pf = (triggerConfig && triggerConfig.vision_potential_felt) || { potential: [], felt: [] };
  const avgNorm = (keys) => {
    const vals = keys.map(k => normIndicator(k, data[k])).filter(v => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const potentialFelt = { potential: avgNorm(pf.potential), felt: avgNorm(pf.felt) };

  return { axes, overall, axisDetail, missing: [...new Set(missing)], potentialFelt };
}

/** 비전 적합도 카드 렌더. */
function renderVisionScoreCard(eupName) {
  const host = document.getElementById('eup-vision-score');
  if (!host) return;
  if (!triggerConfig || !triggerConfig.vision_axes) { host.innerHTML = ''; return; }

  const vs = visionScore(eupName);
  const axesCfg = triggerConfig.vision_axes;
  const scoreColor = (s) => s == null ? '#9CA3AF' : s >= 70 ? '#2D6A4F' : s >= 45 ? '#D97706' : '#B5182B';

  const axisRows = Object.keys(axesCfg).map(k => {
    const cfg = axesCfg[k];
    const s = vs.axes[k];
    const pct = s == null ? 0 : s;
    return `<div class="nyj-vision-axis">
      <div class="nyj-vision-axis-head">
        <span class="nyj-vision-axis-key">${k}</span>
        <span class="nyj-vision-axis-name">${cfg.name}</span>
        <span class="nyj-vision-axis-score" style="color:${scoreColor(s)}">${s == null ? '–' : s}</span>
      </div>
      <div class="nyj-vision-gauge"><div class="nyj-vision-gauge-fill" style="width:${pct}%;background:${scoreColor(s)}"></div></div>
    </div>`;
  }).join('');

  const pf = vs.potentialFelt;
  const gap = (pf.potential != null && pf.felt != null) ? pf.potential - pf.felt : null;
  const pfBlock = (pf.potential != null || pf.felt != null) ? `
    <div class="nyj-vision-pf">
      <div class="nyj-vision-pf-label">자원 잠재력 vs 시민 체감 서비스 <span class="nyj-vision-pf-hint">(docx 진단)</span></div>
      <div class="nyj-vision-pf-row"><span class="nyj-pf-tag">자원 잠재</span>
        <div class="nyj-vision-gauge"><div class="nyj-vision-gauge-fill" style="width:${pf.potential||0}%;background:#2D6A4F"></div></div>
        <span class="nyj-pf-val">${pf.potential ?? '–'}</span></div>
      <div class="nyj-vision-pf-row"><span class="nyj-pf-tag">체감 서비스</span>
        <div class="nyj-vision-gauge"><div class="nyj-vision-gauge-fill" style="width:${pf.felt||0}%;background:#D97706"></div></div>
        <span class="nyj-pf-val">${pf.felt ?? '–'}</span></div>
      ${gap != null && gap >= 20 ? `<div class="nyj-vision-pf-warn">⚠️ 자원 잠재력(${pf.potential})에 비해 시민 체감 서비스(${pf.felt})가 낮습니다. 수변·생태쉼터(R5)·농촌체험(W9) 등 체감형 기능 보강이 필요합니다.</div>` : ''}
    </div>` : '';

  host.innerHTML = `
    <div class="nyj-vision-card">
      <div class="nyj-vision-head">
        <div class="nyj-vision-title">🎯 민선 8기 비전 적합도</div>
        <div class="nyj-vision-overall" style="color:${scoreColor(vs.overall)}">${vs.overall == null ? '–' : vs.overall}<span>/100</span></div>
      </div>
      <div class="nyj-vision-axes">${axisRows}</div>
      ${pfBlock}
      ${vs.missing.length ? `<div class="nyj-vision-missing">미수집 지표(추정 제외): ${vs.missing.join(', ')}</div>` : ''}
      <div class="nyj-vision-foot">읍면 분포(현장조사 9 + 시뮬레이션) min-max 정규화 · THE 비전 가중평균</div>
    </div>`;
}

/**
 * 읍면 선택
 */
function selectDong(admCd, admNm, cityId) {
  if (!admCd) return;
  state.selectedDong = admCd;
  // 읍면 선택 시 행정리 선택은 자동 해제
  if (state.selectedRi) {
    state.selectedRi = null;
    hideRiDetailPanel();
    highlightSelectedRiOnMap(null);
  }

  // 시군과 어긋나면 시군도 맞춤 (단, selectCity 재호출 X — 무한루프 방지)
  if (state.selectedCity !== cityId && CITIES[cityId]) {
    state.selectedCity = cityId;
    const noMsg = document.getElementById('no-selection-msg');
    if (noMsg) noMsg.style.display = 'none';
    const cityDetail = document.getElementById('city-detail');
    if (cityDetail) cityDetail.classList.remove('hidden');
    // 시군 패널 데이터도 채워놔야 dong→city 복귀 시 비어있지 않음
    updateDetailPanel(cityId);
    updateRadarChart(cityId);
    updateIndicatorList();
  }

  showDongDetailPanel(admCd, admNm, cityId);
  renderRegionBasicStats('dong', admCd, `${CITIES[cityId] ? CITIES[cityId].name : cityId} ${admNm}`);
  renderRegionBreadcrumb();
  highlightSelectedDongOnMap(admCd);
  showMapSelectToast('📍', admNm, '읍면');
  updateMapContextHud();
}

/**
 * 읍면 선택 해제 — 시군 보기로 복귀
 * @param {object} [opts] - { skipBreadcrumb: true } 일 때 breadcrumb 재렌더 생략
 *                          (selectCity 내부 호출 시 중복 렌더 방지용)
 */
function clearDongSelection(opts = {}) {
  state.selectedDong = null;
  // 하위 행정리도 함께 해제
  if (state.selectedRi) {
    state.selectedRi = null;
    hideRiDetailPanel();
    highlightSelectedRiOnMap(null);
  }
  hideDongDetailPanel();
  highlightSelectedDongOnMap(null);
  // 시군 패널 데이터 재렌더 — dong → city 복귀 시 점수·차트가 비어있지 않도록
  if (state.selectedCity) {
    updateDetailPanel(state.selectedCity);
    updateRadarChart(state.selectedCity);
    updateIndicatorList();
  }
  if (!opts.skipBreadcrumb) renderRegionBreadcrumb();
}

/**
 * Breadcrumb 동적 렌더
 */
function renderRegionBreadcrumb() {
  const root = document.getElementById('region-breadcrumb');
  if (!root) return;
  const cityId = state.selectedCity;
  if (!cityId) { root.innerHTML = ''; return; }

  const cityName = (CITIES[cityId] && CITIES[cityId].name) || cityId;
  const dongCd = state.selectedDong;
  const dongInfo = dongCd ? DONG_INFO_CACHE[dongCd] : null;
  const riCd = state.selectedRi;
  const riInfo = riCd ? RI_INFO_CACHE[riCd] : null;

  const parts = [];
  // 시군 step
  parts.push(
    `<button class="region-breadcrumb-step ${!dongCd && !riCd ? 'is-active' : ''}" ` +
    `data-level="city" data-id="${cityId}" type="button">🏙️ ${cityName}</button>`
  );
  // 읍면 step
  parts.push('<span class="region-breadcrumb-sep">›</span>');
  if (dongCd && dongInfo) {
    parts.push(
      `<button class="region-breadcrumb-step ${!riCd ? 'is-active' : ''}" ` +
      `data-level="dong" data-id="${dongCd}" type="button">📍 ${dongInfo.admNm}</button>`
    );
  } else {
    parts.push('<span class="region-breadcrumb-step is-disabled">읍면을 클릭하세요</span>');
  }
  // 행정리 step
  parts.push('<span class="region-breadcrumb-sep">›</span>');
  if (riCd && riInfo) {
    parts.push(
      `<button class="region-breadcrumb-step is-active" ` +
      `data-level="ri" data-id="${riCd}" type="button">🏘️ ${riInfo.riNm}</button>`
    );
  } else if (dongCd && riLayer) {
    parts.push('<span class="region-breadcrumb-step is-disabled">행정리를 클릭하세요</span>');
  } else if (!riLayer) {
    parts.push('<span class="region-breadcrumb-step is-disabled">행정리 데이터 없음</span>');
  } else {
    parts.push('<span class="region-breadcrumb-step is-disabled">행정리</span>');
  }

  root.innerHTML = parts.join('');
  // 시군 step 클릭 → 읍면·행정리 선택 해제
  root.querySelectorAll('[data-level="city"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.selectedDong || state.selectedRi) clearDongSelection();
    });
  });
  // 읍면 step 클릭 (이미 선택된 상태) → 행정리만 해제
  root.querySelectorAll('[data-level="dong"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.selectedRi) clearRiSelection();
    });
  });
}

/**
 * 읍면 상세 패널 표시
 */
function showDongDetailPanel(admCd, admNm, cityId) {
  const info = getDongInfo(admCd, admNm, cityId);
  const nameEl = document.getElementById('dong-detail-name');
  const sourceEl = document.getElementById('dong-detail-source');
  const gridEl = document.getElementById('dong-info-grid');
  const detail = document.getElementById('dong-detail');
  const cityDetail = document.getElementById('city-detail');
  if (!nameEl || !gridEl || !detail || !cityDetail) return;

  nameEl.textContent = `${info.cityName} ${info.admNm}`;
  // 데이터 출처 배지
  if (sourceEl) {
    sourceEl.classList.remove('is-source-kosis', 'is-source-sgis', 'is-source-boundary', 'is-source-mock');
    if (info._source === 'sgis') {
      sourceEl.textContent = 'SGIS 데이터';
      sourceEl.classList.add('is-source-sgis');
    } else if (info._source === 'kosis') {
      sourceEl.textContent = 'KOSIS 데이터';
      sourceEl.classList.add('is-source-kosis');
    } else if (info._source === 'boundary') {
      sourceEl.textContent = '경계 데이터';
      sourceEl.classList.add('is-source-boundary');
    } else {
      sourceEl.textContent = '예시 데이터';
      sourceEl.classList.add('is-source-mock');
    }
  }
  const fmtMaybeNumber = (value, suffix = '') => (
    value == null || value === ''
      ? '-'
      : `${Number(value).toLocaleString()}${suffix}`
  );
  gridEl.innerHTML = `
    <div class="dong-info-card">
      <div class="dong-info-label">인구</div>
      <div class="dong-info-value">${fmtMaybeNumber(info.population, ' 명')}</div>
    </div>
    <div class="dong-info-card">
      <div class="dong-info-label">면적</div>
      <div class="dong-info-value">${fmtMaybeNumber(info.area, ' km²')}</div>
    </div>
    <div class="dong-info-card">
      <div class="dong-info-label">가구 수</div>
      <div class="dong-info-value">${fmtMaybeNumber(info.households, ' 가구')}</div>
    </div>
    <div class="dong-info-card">
      <div class="dong-info-label">토지 이용</div>
      <div class="dong-info-value">${info.landMix}</div>
    </div>
    <div class="dong-info-card dong-info-card--wide">
      <div class="dong-info-label">읍면 성격</div>
      <div class="dong-info-value">${info.character} · ${info.cityType} ${info.cityName} 소속</div>
    </div>
  `;
  cityDetail.classList.add('is-dong-mode');
  detail.classList.remove('hidden');

  // 0531 통합: 읍면 비전 적합도 + 트리거 시사점 카드 (남양주 읍면만)
  renderEupAnalysis(admNm, cityId, info);
}

/**
 * 읍면 패널의 비전 적합도 + 트리거 시사점 카드 영역 렌더/정리.
 * 남양주 읍면일 때만 표시. urban 동은 현장조사 미수집 안내 후 시뮬레이션 기반 평가.
 */
function renderEupAnalysis(eupName, cityId, info) {
  const noticeHost = document.getElementById('eup-analysis-notice');
  const staticNote = document.getElementById('dong-detail-note');
  if (cityId !== 'namyangju' || !triggerConfig) {
    if (staticNote) staticNote.style.display = ''; // 비남양주: 기존 안내 표시
    clearEupAnalysis();
    return;
  }
  // 남양주 읍면: 이제 읍면 지표·시사점을 제공하므로 기존 "시군 단위에서만" 안내는 숨김
  if (staticNote) staticNote.style.display = 'none';
  const hasField = !!(fieldSurveyData && fieldSurveyData.eups && fieldSurveyData.eups[eupName]);
  if (noticeHost) {
    noticeHost.innerHTML = hasField
      ? `<span class="data-status-badge status-field">현장조사</span> 9개 농촌 읍면 가상 현장조사 데이터 기반 분석입니다.`
      : `<span class="data-status-badge status-simulation">시뮬레이션</span> 이 읍면(도심형)은 현장조사 미수집 — 시뮬레이션·시군 고정값 기반 추정입니다.`;
  }
  renderVisionScoreCard(eupName);
  renderEupTriggerCards(eupName);
}

/** 읍면 분석 영역 비우기 (시군 복귀·非남양주 시) */
function clearEupAnalysis() {
  ['eup-analysis-notice', 'eup-vision-score', 'eup-trigger-grid', 'eup-insight-cards'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

function hideDongDetailPanel() {
  const detail = document.getElementById('dong-detail');
  const cityDetail = document.getElementById('city-detail');
  if (detail) detail.classList.add('hidden');
  if (cityDetail) cityDetail.classList.remove('is-dong-mode');
  clearEupAnalysis(); // 0531: 읍면 비전/트리거 카드 정리
}

/**
 * 지도에서 선택된 읍면 폴리곤만 강조
 */
function highlightSelectedDongOnMap(admCd) {
  if (!dongLayer) return;
  dongLayer.eachLayer(layer => {
    const isSel = layer.feature && layer.feature.properties &&
                  layer.feature.properties.adm_cd === admCd;
    layer.setStyle(isSel
      ? { color: '#C56F2E', weight: 3, fillColor: '#E08A4A', fillOpacity: 0.20, dashArray: null }
      : { color: 'rgba(40,40,40,0.4)', weight: 0.7, fillColor: 'transparent', fillOpacity: 0, dashArray: '3,2' });
  });
}

// ===================================================================
// === 행정리(Ri) 드릴다운 (위계 3단계) ===
// ===================================================================

const RI_INFO_CACHE = {};

/**
 * 행정리 메타정보 (boundary 속성 기반 + 가능한 한 보강)
 */
function getRiInfo(riCd, riNm, dongCd, cityId, leafletLayer) {
  if (RI_INFO_CACHE[riCd]) return RI_INFO_CACHE[riCd];
  const city = CITIES[cityId];
  // 부모 읍면 이름 — dongLayer feature 검색
  let dongNm = '';
  if (dongLayer) {
    dongLayer.eachLayer(l => {
      const p = l.feature && l.feature.properties;
      if (p && p.adm_cd === dongCd) dongNm = p.adm_nm;
    });
  }
  // 면적/중심좌표 — Leaflet layer 활용
  let areaText = '-';
  let centerText = '-';
  if (leafletLayer) {
    try {
      const bounds = leafletLayer.getBounds();
      const c = bounds.getCenter();
      centerText = `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
      // 면적 계산 — 간이 (실측 위해선 turf 필요; 여기선 bbox 기준 근사)
      const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
      const widthKm = (ne.lng - sw.lng) * 111 * Math.cos(c.lat * Math.PI / 180);
      const heightKm = (ne.lat - sw.lat) * 111;
      const bboxArea = widthKm * heightKm;
      areaText = `≈ ${(bboxArea * 0.55).toFixed(2)} km² (개략)`;
    } catch (_) {}
  }
  const info = {
    riCd, riNm, dongCd, dongNm, cityId,
    cityName: (city && city.name) || cityId,
    cityType: (city && city.type) || '',
    areaText,
    centerText,
    legalCode: riCd,
  };
  RI_INFO_CACHE[riCd] = info;
  return info;
}

function selectRi(riCd, riNm, dongCd, cityId, leafletLayer) {
  if (!riCd) return;
  state.selectedRi = riCd;
  // 상위 단위도 동기화
  if (CITIES[cityId]) state.selectedCity = cityId;
  state.selectedDong = dongCd;
  if (dongCd && !DONG_INFO_CACHE[dongCd]) {
    let dongNm = '';
    if (dongLayer) {
      dongLayer.eachLayer(l => {
        const p = l.feature && l.feature.properties;
        if (p && p.adm_cd === dongCd) dongNm = p.adm_nm || '';
      });
    }
    getDongInfo(dongCd, dongNm, cityId);
  }

  // 시군 패널 표시 보장
  const noMsg = document.getElementById('no-selection-msg');
  if (noMsg) noMsg.style.display = 'none';
  const cityDetail = document.getElementById('city-detail');
  if (cityDetail) cityDetail.classList.remove('hidden');

  showRiDetailPanel(riCd, riNm, dongCd, cityId, leafletLayer);
  renderRegionBreadcrumb();
  highlightSelectedRiOnMap(riCd);
  showMapSelectToast('🏘️', riNm, '행정리');
  updateMapContextHud();
}

function clearRiSelection(opts = {}) {
  state.selectedRi = null;
  hideRiDetailPanel();
  highlightSelectedRiOnMap(null);
  if (state.selectedDong) {
    const dongInfo = DONG_INFO_CACHE[state.selectedDong];
    if (dongInfo) {
      showDongDetailPanel(dongInfo.admCd, dongInfo.admNm, dongInfo.cityId);
      renderRegionBasicStats('dong', dongInfo.admCd, `${dongInfo.cityName} ${dongInfo.admNm}`);
    }
  }
  if (!opts.skipBreadcrumb) renderRegionBreadcrumb();
}

function showRiDetailPanel(riCd, riNm, dongCd, cityId, leafletLayer) {
  const info = getRiInfo(riCd, riNm, dongCd, cityId, leafletLayer);
  const nameEl = document.getElementById('ri-detail-name');
  const parentEl = document.getElementById('ri-detail-parent');
  const gridEl = document.getElementById('ri-info-grid');
  const detail = document.getElementById('ri-detail');
  const cityDetail = document.getElementById('city-detail');
  if (!nameEl || !gridEl || !detail || !cityDetail) return;

  nameEl.textContent = info.riNm;
  if (parentEl) parentEl.textContent = info.dongNm ? `${info.cityName} ${info.dongNm}` : info.cityName;
  gridEl.innerHTML = `
    <div class="ri-info-card">
      <div class="ri-info-label">소속 시군</div>
      <div class="ri-info-value">${info.cityName}</div>
    </div>
    <div class="ri-info-card">
      <div class="ri-info-label">소속 읍·면</div>
      <div class="ri-info-value">${info.dongNm || '-'}</div>
    </div>
    <div class="ri-info-card">
      <div class="ri-info-label">법정리 코드</div>
      <div class="ri-info-value" style="font-family: 'JetBrains Mono', monospace; font-size: 13px;">${info.legalCode}</div>
    </div>
    <div class="ri-info-card">
      <div class="ri-info-label">대표 좌표</div>
      <div class="ri-info-value" style="font-size: 13px;">${info.centerText}</div>
    </div>
    <div class="ri-info-card ri-info-card--wide">
      <div class="ri-info-label">개략 면적 (bbox 기반)</div>
      <div class="ri-info-value">${info.areaText}</div>
    </div>
  `;
  cityDetail.classList.add('is-ri-mode');
  detail.classList.remove('hidden');
  renderRegionBasicStats('ri', riCd, info.riNm);
}

function hideRiDetailPanel() {
  const detail = document.getElementById('ri-detail');
  const cityDetail = document.getElementById('city-detail');
  if (detail) detail.classList.add('hidden');
  if (cityDetail) cityDetail.classList.remove('is-ri-mode');
}

function highlightSelectedRiOnMap(riCd) {
  if (!riLayer) return;
  riLayer.eachLayer(layer => {
    const p = layer.feature && layer.feature.properties;
    const isSel = p && p.ri_cd === riCd;
    layer.setStyle(isSel
      ? { color: '#2C5A8A', weight: 2.5, fillColor: '#4A90D9', fillOpacity: 0.22, dashArray: null }
      : { color: 'rgba(74, 144, 217, 0.55)', weight: 0.6, fillColor: 'transparent', fillOpacity: 0, dashArray: '2,2' });
  });
}

// ===================================================================
// === 검색 기능 ===
// ===================================================================

/**
 * 검색 기능 초기화
 */
function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  // 자동완성 드롭다운 컨테이너 생성
  const dropdown = document.createElement('div');
  dropdown.id = 'search-dropdown';
  dropdown.className = 'search-dropdown';
  dropdown.style.display = 'none';
  input.parentElement && input.parentElement.appendChild(dropdown);

  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (!query) {
      dropdown.style.display = 'none';
      return;
    }
    renderSearchDropdown(query, input, dropdown);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      input.value = '';
    }
  });

  // 외부 클릭 시 드롭다운 닫기
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

/**
 * 검색 드롭다운 렌더링
 * @param {string} query
 * @param {HTMLElement} input
 * @param {HTMLElement} dropdown
 */
function renderSearchDropdown(query, input, dropdown) {
  const matched = Object.values(CITIES).filter(city =>
    city.name.includes(query)
  );

  if (matched.length === 0) {
    dropdown.innerHTML = '<div class="search-no-result">검색 결과가 없습니다.</div>';
    dropdown.style.display = 'block';
    return;
  }

  dropdown.innerHTML = matched.map(city => `
    <div class="search-item" data-city-id="${city.id}">
      <span class="search-item-name">${city.name}</span>
      <span class="search-item-type">${city.type}</span>
    </div>
  `).join('');
  dropdown.style.display = 'block';

  dropdown.querySelectorAll('.search-item').forEach(item => {
    item.addEventListener('click', () => {
      const cityId = item.dataset.cityId;
      dropdown.style.display = 'none';
      input.value = '';
      selectCity(cityId);
    });
  });
}

// ===================================================================
// === 범례 생성 ===
// ===================================================================

/**
 * 지도 범례 생성 (Leaflet control)
 */
let legendControl = null;

function buildClassLegendItems(colors, breaks, unit, higherBetter) {
  // 높을수록 좋은 지표는 높은 클래스가 진한 색 → 그대로
  // 낮을수록 좋은 지표는 역순으로 라벨 표시
  const labels = higherBetter
    ? ['최하위', '하위', '중위', '상위', '최상위']
    : ['최상위', '상위', '중위', '하위', '최하위'];

  return colors.map((color, i) => {
    const lo = breaks[i] % 1 === 0 ? breaks[i] : breaks[i].toFixed(1);
    const hi = breaks[i + 1] % 1 === 0 ? breaks[i + 1] : breaks[i + 1].toFixed(1);
    return `
      <div class="legend-class-item">
        <span class="legend-class-swatch" style="background:${color}"></span>
        <span class="legend-class-range">${lo}–${hi}${unit ? ' ' + unit : ''}</span>
        <span class="legend-class-label">${labels[i]}</span>
      </div>`;
  }).join('');
}

function buildLegendHTML() {
  const key = state.activeIndicator;

  if (key === 'total') {
    const allScores = Object.keys(CITIES).map(id => calcOverallScore(id));
    const breaks = getClassBreaks(allScores);
    return `
      <div class="legend-title">★ 종합점수</div>
      ${buildClassLegendItems(CLASS_COLORS.composite, breaks, '점', true)}`;
  }

  if (CATEGORY_TOTALS[key]) {
    const { category, label } = CATEGORY_TOTALS[key];
    const allScores = Object.keys(CITIES).map(id => calcCategoryScore(id, category));
    const breaks = getClassBreaks(allScores);
    return `
      <div class="legend-title">◆ ${label}</div>
      ${buildClassLegendItems(CLASS_COLORS[category], breaks, '점', true)}`;
  }

  const ind = INDICATORS[key];
  if (!ind) return '';
  const allValues = getAllValuesForIndicator(key);
  const breaks = getClassBreaks(allValues);
  const colors = ind.higherBetter
    ? CLASS_COLORS[ind.category]
    : [...CLASS_COLORS[ind.category]].reverse();
  const catLabel = { samlter: '삶터', ilter: '일터', shimter: '쉼터' };
  return `
    <div class="legend-title">${catLabel[ind.category]} — ${ind.name}</div>
    ${buildClassLegendItems(colors, breaks, ind.unit, ind.higherBetter)}`;
}

function updateLegend() {
  if (!legendControl || !legendControl.getContainer()) return;
  legendControl.getContainer().innerHTML = buildLegendHTML();
}

function initLegend() {
  if (!map) return;

  legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = buildLegendHTML();
    return div;
  };
  legendControl.addTo(map);
}

// ===================================================================
// === 랜딩 화면 ===
// ===================================================================

/**
 * 랜딩 화면 초기화 (포털 v2)
 * - 매 진입마다 표시
 * - KPI 카운트업, 미니맵 SVG 렌더링, Bento 카드 라우팅
 */
function initLandingScreen() {
  const screen = document.getElementById('landing-screen');
  if (!screen) return;

  // ── 브라우저 뒤로가기 지원 (History API) ──
  // 전략: 대시보드 진입 시 history.pushState(#dashboard) → 뒤로가기 활성화
  //       popstate / hashchange 둘 다 감지 → 최대 호환성

  const initialHash = location.hash;

  // 뒤로가기 / 해시 변경 감지 — 오버레이/랜딩 라우팅 통합 (항상 등록)
  const onNavBack = () => {
    const h = location.hash;
    if (h === '#ranking') {
      showRankingPage();
    } else if (h === '#guide') {
      showGuidePage();
    } else if (h === '#explore' || h.startsWith('#explore/')) {
      const key = h.startsWith('#explore/') ? h.slice('#explore/'.length) : null;
      showExplorePage(key);
    } else if (h === '#dashboard') {
      hideAllOverlayScreens();
      screen.classList.add('is-hidden');
    } else {
      // 해시 없음 → 랜딩으로 복귀
      hideAllOverlayScreens();
      returnToLanding();
    }
  };
  window.addEventListener('popstate',   onNavBack);
  window.addEventListener('hashchange', onNavBack);

  // 해시별 직접 진입 처리 — 리스너 등록 후 분기
  if (initialHash === '#dashboard') {
    screen.classList.add('is-hidden');
    return;
  }
  if (initialHash === '#ranking') {
    screen.classList.add('is-hidden');
    setTimeout(() => showRankingPage(), 0);
    return;
  }
  if (initialHash === '#guide') {
    screen.classList.add('is-hidden');
    setTimeout(() => showGuidePage(), 0);
    return;
  }
  if (initialHash === '#explore' || initialHash.startsWith('#explore/')) {
    screen.classList.add('is-hidden');
    const key = initialHash.startsWith('#explore/') ? initialHash.slice('#explore/'.length) : null;
    setTimeout(() => showExplorePage(key), 0);
    return;
  }

  // 잔여 해시 정리 (새로고침 등)
  if (location.hash && location.hash !== '#') {
    history.replaceState(null, '', location.href.split('#')[0]);
  }

  // 1) KPI 카운트업
  initLandingKpiCounters();

  // 2) 미니맵 SVG 렌더 (비동기 — GeoJSON fetch)
  initLandingMinimap();

  // 3) 메인 CTA + Bento 카드 클릭 라우팅
  const closeAndAct = (action) => {
    // #dashboard pushState → 뒤로가기 버튼 즉시 활성화 (새 탭 포함)
    const base = location.href.split('#')[0];
    history.pushState({ page: 'dashboard' }, '', base + '#dashboard');
    screen.classList.add('is-exiting');
    const hide = () => {
      screen.classList.add('is-hidden');
      if (typeof handleLandingAction === 'function') handleLandingAction(action);
    };
    screen.addEventListener('animationend', hide, { once: true });
    setTimeout(hide, 650);
  };

  // landing-cta-main 는 이제 data-action="map" 보유 — 아래 위임 핸들러에서 처리

  // 액션이 있는 모든 버튼 (네비, Bento, 보조 CTA)
  screen.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      // 스크롤은 닫지 않음
      if (action === 'scroll-bento') {
        const target = document.getElementById('landing-bento');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // 오버레이 페이지 라우팅 (랜딩을 닫지 않고 그 위에 띄움)
      if (action === 'guide') {
        showGuidePage();
        return;
      }
      if (action === 'ranking') {
        showRankingPage();
        return;
      }
      if (action === 'explore') {
        showExplorePage();
        return;
      }
      // 데이터 출처는 아직 준비 중
      if (action === 'sources') {
        showLandingToast('🛠️ 데이터 출처 페이지는 준비 중입니다');
        return;
      }
      closeAndAct(action);
    });
  });
}

/**
 * KPI 카운트업 애니메이션
 */
function initLandingKpiCounters() {
  const nums = document.querySelectorAll('.landing-kpi-num[data-target]');
  nums.forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    if (!Number.isFinite(target)) return;
    const duration = 1100;
    const start = performance.now();
    el.textContent = '0';

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    // 살짝 지연 (히어로 페이드업과 맞춤)
    setTimeout(() => requestAnimationFrame(tick), 380);
  });
}

/**
 * 히어로 우측 미니맵 SVG 렌더 (GeoJSON 단순 outline)
 */
function initLandingMinimap() {
  const svg = document.getElementById('landing-minimap');
  const tooltip = document.getElementById('landing-minimap-tooltip');
  if (!svg) return;

  fetch('./dat/gyeonggi-sigun.geojson', { cache: 'no-cache' })
    .then(r => r.json())
    .then(geo => {
      // 모든 좌표의 bbox 계산
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      const eachCoord = (coords) => {
        coords.forEach(c => {
          if (typeof c[0] === 'number' && typeof c[1] === 'number') {
            minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]);
            minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
          } else {
            eachCoord(c);
          }
        });
      };
      geo.features.forEach(f => eachCoord(f.geometry.coordinates));

      const W = 400, H = 300, PAD = 12;
      const sx = (W - PAD * 2) / (maxLng - minLng);
      const sy = (H - PAD * 2) / (maxLat - minLat);
      const s = Math.min(sx, sy);
      const ox = PAD + ((W - PAD * 2) - s * (maxLng - minLng)) / 2;
      const oy = PAD + ((H - PAD * 2) - s * (maxLat - minLat)) / 2;
      const project = (lng, lat) => [ox + (lng - minLng) * s, oy + (maxLat - lat) * s];

      const ringToPath = (ring) => {
        return ring.map((pt, i) => {
          const [x, y] = project(pt[0], pt[1]);
          return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
        }).join(' ') + ' Z';
      };

      const NS = 'http://www.w3.org/2000/svg';
      svg.innerHTML = '';

      geo.features.forEach(f => {
        // GeoJSON properties.name이 이중 이스케이프 되어 있어 CITIES 매핑 사용
        const cityId = f.properties.id;
        const cityName = (CITIES[cityId] && CITIES[cityId].name) || cityId || '';
        let d = '';
        const g = f.geometry;
        if (g.type === 'Polygon') {
          d = g.coordinates.map(ringToPath).join(' ');
        } else if (g.type === 'MultiPolygon') {
          d = g.coordinates.map(poly => poly.map(ringToPath).join(' ')).join(' ');
        }
        if (!d) return;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'minimap-region');
        path.setAttribute('data-name', cityName);
        path.addEventListener('mousemove', (e) => {
          if (!tooltip) return;
          tooltip.textContent = cityName;
          tooltip.classList.add('is-visible');
          const wrapRect = svg.parentElement.getBoundingClientRect();
          tooltip.style.left = (e.clientX - wrapRect.left + 10) + 'px';
          tooltip.style.top  = (e.clientY - wrapRect.top  - 24) + 'px';
        });
        path.addEventListener('mouseleave', () => {
          if (tooltip) tooltip.classList.remove('is-visible');
        });
        // 클릭 → 시군 상세 패널
        path.addEventListener('click', () => {
          if (tooltip) tooltip.classList.remove('is-visible');
          if (cityId) showCityPanel(cityId);
        });
        svg.appendChild(path);
      });
    })
    .catch(err => console.warn('[landing minimap] GeoJSON load failed', err));
}

/**
 * 랜딩 화면 복귀 (대시보드 헤더 로고 클릭 시)
 */
function returnToLanding() {
  const screen = document.getElementById('landing-screen');
  if (!screen) return;

  // 이전 상태 클래스 초기화
  screen.classList.remove('is-exiting', 'landing-screen--return', 'is-hidden');

  // 강제 reflow → 애니메이션 재트리거
  void screen.offsetWidth;

  screen.classList.add('landing-screen--return');

  // 스크롤 맨 위로
  const scrollWrap = screen.querySelector('.landing-scroll-wrap');
  if (scrollWrap) scrollWrap.scrollTop = 0;
}

/**
 * 시군 상세 패널 표시 (미니맵 클릭)
 * @param {string} cityId
 */
function showCityPanel(cityId) {
  const panel = document.getElementById('landing-city-panel');
  if (!panel) return;
  const city = CITIES[cityId];
  if (!city) return;

  // ── 헤더 ──
  const typeEl = document.getElementById('city-panel-type');
  const nameEl = document.getElementById('city-panel-name');
  const descEl = document.getElementById('city-panel-desc');
  if (typeEl) typeEl.textContent = city.type || '시군';
  if (nameEl) nameEl.textContent = city.name;
  if (descEl) descEl.textContent = city.description || '';

  // ── 종합점수 ──
  const overall = calcOverallScore(cityId);
  const rank    = calcOverallRank(cityId);
  const scoreVal = document.getElementById('city-panel-score-val');
  const scoreBar = document.getElementById('city-panel-score-bar');
  const rankEl   = document.getElementById('city-panel-rank');
  if (scoreVal) scoreVal.textContent = overall.toFixed(1) + '점';
  if (scoreBar) { scoreBar.style.width = '0%'; setTimeout(() => { scoreBar.style.width = overall.toFixed(1) + '%'; }, 60); }
  if (rankEl)   rankEl.textContent = `15개 시군 중 ${rank}위`;

  // ── 카테고리 지표 ──
  const cats = [
    { key: 'samlter', label: '삶터', icon: '🏘️', cls: 'cat--samlter' },
    { key: 'ilter',   label: '일터', icon: '🌾', cls: 'cat--ilter'   },
    { key: 'shimter', label: '쉼터', icon: '🌲', cls: 'cat--shimter' },
  ];
  const container = document.getElementById('city-panel-categories');
  if (container) {
    container.innerHTML = '';
    cats.forEach(cat => {
      const catScore = calcCategoryScore(cityId, cat.key);
      const indicators = Object.entries(INDICATORS).filter(([, v]) => v.category === cat.key);

      const catEl = document.createElement('div');
      catEl.className = `city-panel-cat ${cat.cls}`;

      // 지표 리스트 HTML
      let indHTML = '<ul class="city-panel-ind-list">';
      indicators.forEach(([key, ind]) => {
        const val = city.indicators[key];
        if (val === undefined || val === null) return;
        const { min, max } = getIndicatorRange(key);
        let pct = (max - min > 0) ? ((val - min) / (max - min)) * 100 : 50;
        if (!ind.higherBetter) pct = 100 - pct;
        pct = Math.max(2, Math.min(100, pct));
        indHTML += `
          <li class="city-panel-ind-item">
            <div class="ind-top">
              <span class="ind-name">${ind.name}</span>
              <span class="ind-value">${formatValue(val, ind.unit)}</span>
            </div>
            <div class="ind-bar"><div class="ind-bar-fill" style="width:0%" data-pct="${pct.toFixed(1)}"></div></div>
          </li>`;
      });
      indHTML += '</ul>';

      catEl.innerHTML = `
        <div class="city-panel-cat-head">
          <span class="cat-icon">${cat.icon}</span>
          <span class="cat-name">${cat.label}</span>
          <span class="cat-score">${catScore.toFixed(1)}점</span>
        </div>
        ${indHTML}`;
      container.appendChild(catEl);
    });

    // 약간 딜레이 후 바 너비 적용 (CSS transition 작동)
    setTimeout(() => {
      container.querySelectorAll('.ind-bar-fill[data-pct]').forEach(el => {
        el.style.width = el.dataset.pct + '%';
      });
    }, 80);
  }

  // ── "지도에서 자세히 보기" 버튼 ──
  const gotoBtn = document.getElementById('city-panel-goto-btn');
  if (gotoBtn) {
    gotoBtn.onclick = () => {
      hideCityPanel();
      const base = location.href.split('#')[0];
      history.pushState({ page: 'dashboard' }, '', base + '#dashboard');
      const screen = document.getElementById('landing-screen');
      if (screen) {
        screen.classList.add('is-exiting');
        const hide = () => {
          screen.classList.add('is-hidden');
          if (typeof selectCity === 'function') {
            try { selectCity(cityId); } catch (_) {}
          }
        };
        screen.addEventListener('animationend', hide, { once: true });
        setTimeout(hide, 650);
      }
    };
  }

  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
}

/**
 * 시군 상세 패널 닫기
 */
function hideCityPanel() {
  const panel = document.getElementById('landing-city-panel');
  if (!panel) return;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
}

/**
 * 랜딩 토스트 (준비중 안내 등)
 */
let _landingToastTimer = null;
function showLandingToast(message) {
  const toast = document.getElementById('landing-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(_landingToastTimer);
  _landingToastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2400);
}

/**
 * 랜딩 카드 액션 라우팅 — 닫힌 후 실행
 */
function handleLandingAction(action) {
  switch (action) {
    case 'map':
      // 그냥 대시보드 노출 (기본)
      break;

    case 'compare': {
      // 비교 모드 활성화 시도
      const cmpBtn = document.getElementById('add-comparison-btn');
      if (cmpBtn) cmpBtn.click();
      break;
    }

    case 'scenario': {
      // 가운데 안내 + 시나리오 탭으로 이동 시도
      // 시나리오는 시군 선택 후에만 의미가 있어 안내 표시
      if (typeof switchTab === 'function') switchTab('scenario');
      break;
    }

    case 'namyangju': {
      // 남양주 자동 선택
      if (typeof selectCity === 'function') {
        try { selectCity('namyangju'); } catch (_) {}
      }
      break;
    }

    default:
      break;
  }
}

// ===================================================================
// === 오버레이 페이지: 시군 랭킹 / 지표 가이드 ===
// ===================================================================

const CATEGORY_META = {
  samlter: { label: '삶터', icon: '🏘️', tagline: '생활·인구·정주', color: 'var(--samlter)' },
  ilter:   { label: '일터', icon: '🌾', tagline: '농업·경제·산업', color: 'var(--ilter)' },
  shimter: { label: '쉼터', icon: '🌲', tagline: '자연·경관·휴양', color: 'var(--shimter)' },
};

// 시군별 자율지표 정의 매핑 — 향후 다른 시군 추가 시 여기에 등록
const AUTONOMY_INDICATORS_BY_CITY = {
  namyangju: { city: '남양주시', indicators: JAYUL_INDICATORS_POOL },
};

/**
 * 시군 랭킹 — 카테고리별 점수 정렬 후 포디움 + 리스트 렌더
 */
function renderRankingPage(category) {
  const podiumEl = document.getElementById('ranking-podium');
  const listEl   = document.getElementById('ranking-list');
  const screenEl = document.getElementById('ranking-screen');
  if (!podiumEl || !listEl || !screenEl) return;

  // 점수 계산
  const scored = Object.keys(CITIES).map(cityId => ({
    cityId,
    name: CITIES[cityId].name,
    type: CITIES[cityId].type || '',
    score: category === 'overall'
      ? calcOverallScore(cityId)
      : calcCategoryScore(cityId, category),
  })).sort((a, b) => b.score - a.score);

  const maxScore = Math.max(...scored.map(s => s.score), 1);

  // 카테고리 액센트 클래스 토글
  screenEl.classList.remove('ranking-screen-cat-samlter', 'ranking-screen-cat-ilter', 'ranking-screen-cat-shimter');
  if (category !== 'overall') screenEl.classList.add(`ranking-screen-cat-${category}`);

  // 포디움 (1·2·3) — DOM 순서: 2위·1위·3위 (가운데 1위)
  const medals = ['🥇', '🥈', '🥉'];
  const podiumOrder = [scored[1], scored[0], scored[2]];
  const podiumClassOrder = [2, 1, 3];
  podiumEl.innerHTML = podiumOrder.map((s, i) => {
    if (!s) return '';
    const rank = podiumClassOrder[i];
    return `
      <div class="podium-card podium-card--${rank}">
        <div class="podium-medal">${medals[rank - 1]}</div>
        <div class="podium-name">${s.name}</div>
        <div class="podium-type">${s.type}</div>
        <div class="podium-score">${s.score.toFixed(1)}<span class="podium-score-unit"> 점</span></div>
      </div>
    `;
  }).join('');

  // 4~15위
  listEl.innerHTML = scored.slice(3).map((s, i) => {
    const rank = i + 4;
    const fillPct = Math.max(0, Math.min(100, (s.score / maxScore) * 100));
    return `
      <li class="ranking-row" data-city-id="${s.cityId}">
        <div class="ranking-row-rank">${rank}</div>
        <div class="ranking-row-body">
          <div class="ranking-row-name">${s.name}<span class="ranking-row-type">${s.type}</span></div>
          <div class="ranking-row-bar"><span class="ranking-row-bar-fill" style="width:${fillPct}%"></span></div>
        </div>
        <div class="ranking-row-score">${s.score.toFixed(1)}</div>
      </li>
    `;
  }).join('');
}

/**
 * 지표 가이드 — 카테고리별 공통/자율 카드 렌더
 */
function renderGuidePage() {
  const wrap = document.getElementById('guide-categories');
  if (!wrap) return;

  const buildCard = (key, def, autonomy) => {
    const dirClass = def.higherBetter ? 'guide-card-direction--up' : 'guide-card-direction--down';
    const dirSymbol = def.higherBetter ? '↑' : '↓';
    const formula = def.formula
      ? `<div class="guide-card-formula">${def.formula}</div>`
      : `<div class="guide-card-formula guide-card-formula--missing">산식 정보 추가 예정</div>`;
    const autoBadge = autonomy
      ? `<span class="guide-card-autobadge">자율 · ${autonomy.city}</span>`
      : '';
    return `
      <div class="guide-card" ${autonomy ? 'data-autonomy="true"' : ''}>
        <div class="guide-card-head">
          <span class="guide-card-keyname">
            <span class="guide-card-key">${key}</span>
            <span class="guide-card-name">${def.name}</span>
          </span>
          <span class="guide-card-direction ${dirClass}">${dirSymbol}</span>
        </div>
        <div class="guide-card-meta">
          ${def.unit ? `<span class="guide-meta-chip">단위: ${def.unit}</span>` : ''}
          ${def.spatial ? `<span class="guide-meta-chip">공간: ${def.spatial}</span>` : ''}
          ${def.year ? `<span class="guide-meta-chip">기준: ${def.year}</span>` : ''}
          ${autoBadge}
        </div>
        ${formula}
      </div>
    `;
  };

  const sections = Object.entries(CATEGORY_META).map(([catKey, meta]) => {
    const commonEntries = Object.entries(INDICATORS).filter(([, v]) => v.category === catKey);
    // 자율지표 — 시군별로 수집 (현재 남양주만)
    const autoEntries = [];
    Object.values(AUTONOMY_INDICATORS_BY_CITY).forEach(({ city, indicators }) => {
      Object.entries(indicators).forEach(([key, def]) => {
        if (def.category === catKey) autoEntries.push({ key, def, autonomy: { city } });
      });
    });

    const commonHTML = commonEntries.map(([k, v]) => buildCard(k, v, null)).join('');
    const autoHTML = autoEntries.map(({ key, def, autonomy }) => buildCard(key, def, autonomy)).join('');

    return `
      <div class="guide-category-section" style="--cat-color: ${meta.color}">
        <div class="guide-category-head">
          <span class="guide-category-icon">${meta.icon}</span>
          <h3 class="guide-category-name">${meta.label}</h3>
          <span class="guide-category-tagline">${meta.tagline}</span>
        </div>
        ${commonEntries.length ? `<div class="guide-subhead">공통지표 (${commonEntries.length})</div><div class="guide-cards">${commonHTML}</div>` : ''}
        ${autoEntries.length ? `<div class="guide-subhead guide-subhead-auto">자율지표 (${autoEntries.length})</div><div class="guide-cards">${autoHTML}</div>` : ''}
      </div>
    `;
  });

  wrap.innerHTML = sections.join('');
}

/**
 * 오버레이 페이지 표시 (랜딩/대시보드 위 풀스크린)
 */
function showOverlayScreen(elId, hash) {
  // 다른 오버레이는 모두 닫기
  document.querySelectorAll('.overlay-screen').forEach(el => {
    if (el.id !== elId) el.classList.add('is-hidden');
  });
  // 랜딩도 숨김
  const landing = document.getElementById('landing-screen');
  if (landing) landing.classList.add('is-hidden');
  // 대상 오버레이 표시
  const target = document.getElementById(elId);
  if (!target) return;
  target.classList.remove('is-hidden');
  // URL hash 업데이트
  if (location.hash !== hash) {
    history.pushState({ page: elId }, '', hash);
  }
  // 스크롤 맨 위로
  const main = target.querySelector('.overlay-main');
  if (main) main.scrollTop = 0;
}

function hideAllOverlayScreens() {
  document.querySelectorAll('.overlay-screen').forEach(el => el.classList.add('is-hidden'));
}

function showRankingPage() {
  renderRankingPage('overall');
  showOverlayScreen('ranking-screen', '#ranking');
  // 탭 활성화 초기화
  const screen = document.getElementById('ranking-screen');
  if (screen) {
    screen.querySelectorAll('.ranking-tab').forEach(t => {
      t.classList.toggle('is-active', t.dataset.cat === 'overall');
    });
  }
}

function showGuidePage() {
  renderGuidePage();
  showOverlayScreen('guide-screen', '#guide');
}

// ===================================================================
// === 지표 탐색 페이지 v2 — SGIS 통계주제도 패턴 (3-column) ===
// ===================================================================
//
//  좌측 (260px): 카테고리 트리 (collapsible 4그룹)
//  가운데 (1fr): 지표 헤더 + 큰 코로플레스 지도 + 산식·표·차트
//  우측 (320px): 호버/클릭한 시군 상세 (한국어 raw) 또는 TOP3 미리보기

// 탐색 페이지 상태
const exploreState = {
  activeKey:   null,
  hoverCity:   null,      // 호버 중인 시군 (우측 aside 표시용)
  pinnedCity:  null,      // 클릭으로 고정된 시군
  search:      '',
  sortBy:      'value',
  sortDir:     'desc',
  chart:       null,
  catCollapsed:{},        // { samlter: true, ilter: false, ... }
  initialized: false,
};

// 지표 메타 통합 조회 — INDICATORS + JAYUL_INDICATORS_POOL
function getIndicatorMeta(key) {
  return (typeof INDICATORS !== 'undefined' && INDICATORS[key])
      || (typeof JAYUL_INDICATORS_POOL !== 'undefined' && JAYUL_INDICATORS_POOL[key])
      || null;
}
function isJayulKey(key) {
  return !!(typeof JAYUL_INDICATORS_POOL !== 'undefined' && JAYUL_INDICATORS_POOL[key]);
}

// 시군의 지표 값 — 공통 또는 자율지표 둘 다 조회
function getCityIndicatorValue(cityId, key) {
  const city = CITIES[cityId];
  if (!city) return null;
  if (city.indicators && key in city.indicators) return city.indicators[key];
  if (city.jayulIndicators && key in city.jayulIndicators) return city.jayulIndicators[key];
  return null;
}

// raw 데이터 조회 — region-meta.json computed 층의 inputs 사용
function getIndicatorRawDetails(cityId, key) {
  const meta = (regionMeta && regionMeta.sigun && regionMeta.sigun[cityId]) || null;
  if (!meta) return null;
  const computedKey = {
    L1: 'L1_pop_growth_rate',
    L2: 'L2_aging_index',
    L3: 'L3_net_migration_rate',
    W2: 'W2_business_count',
    W8: 'W8_service_sales_workers',
  }[key];
  if (computedKey && meta.computed && meta.computed[computedKey]) {
    const c = meta.computed[computedKey];
    return { value: c.value, formula: c.formula, raw: c.inputs || {}, source: 'computed' };
  }
  return null;
}

// raw 한국어 레이블 변환 — 카드/표에서 사람이 읽기 좋게
function getRawHumanLabels(indicatorKey, rawDetails) {
  if (!rawDetails || !rawDetails.raw) return [];
  const r = rawDetails.raw;
  const fmtN = (v, suffix) => (v == null) ? '-' : `${Number(v).toLocaleString()} ${suffix}`;
  const builders = {
    L1: () => {
      const diff = (r.population != null && r.population_prev != null)
        ? r.population - r.population_prev : null;
      return [
        { label: '현재 인구 (최신월)', value: fmtN(r.population, '명') },
        { label: '전년 동월 인구',     value: fmtN(r.population_prev, '명') },
        { label: '증감',              value: (diff != null ? (diff >= 0 ? '+' : '') + diff.toLocaleString() + ' 명' : '-'),
          highlight: true },
      ];
    },
    L2: () => [
      { label: '노령화지수', value: r.aged_child_idx_sgis != null ? Number(r.aged_child_idx_sgis).toFixed(1) : '-',
        highlight: true, note: 'SGIS 직접 제공 (65세이상 ÷ 0–14세 × 100)' },
    ],
    L3: () => {
      const net = (r.inflow != null && r.outflow != null) ? r.inflow - r.outflow : null;
      return [
        { label: '전입자', value: fmtN(r.inflow, '명') },
        { label: '전출자', value: fmtN(r.outflow, '명') },
        { label: '순이동', value: (net != null ? (net >= 0 ? '+' : '') + net.toLocaleString() + ' 명' : '-'),
          highlight: true },
        { label: '총인구', value: fmtN(r.population, '명') },
      ];
    },
    W2: () => [
      { label: '사업체수 (전산업 합계)', value: fmtN(r.corp_cnt, '개'),
        highlight: true, note: 'SGIS company.json (KSIC 전체)' },
    ],
    W8: () => {
      const sum = (r.wholesale_workers || 0) + (r.hospitality_workers || 0);
      return [
        { label: '도소매 종사자 (KSIC G)',     value: fmtN(r.wholesale_workers, '명') },
        { label: '숙박음식 종사자 (KSIC I)',    value: fmtN(r.hospitality_workers, '명') },
        { label: '합계',                       value: fmtN(sum, '명'), highlight: true },
      ];
    },
  };
  return (builders[indicatorKey] || (() => []))();
}

// 표·카드용 raw 약식 (한국어 1줄)
function getRawShortLabel(indicatorKey, rawDetails) {
  const items = getRawHumanLabels(indicatorKey, rawDetails);
  if (!items.length) return null;
  return items
    .filter(it => !it.highlight || items.length === 1)  // hl 있으면 그 외 항목만 모아 표시, 단일 hl 만 있으면 그것 표시
    .slice(0, 3)
    .map(it => `${it.label} ${it.value}`)
    .join(' · ');
}

// 5분위 등급 색상 (1=가장 좋음, 5=가장 나쁨)
const QUANTILE_COLORS = ['#62A03F', '#9CC267', '#E0CE74', '#E89C5A', '#C56F2E'];

function getQuantileClass(rank, total) {
  const q = Math.ceil((rank / total) * 5);
  return Math.min(5, Math.max(1, q));
}

/**
 * 탐색 페이지 열기 — 메인 진입점
 */
function showExplorePage(indicatorKey = null, pinCityId = null) {
  if (!exploreState.initialized) initExploreScreen();
  exploreState.activeKey = indicatorKey || exploreState.activeKey || null;
  exploreState.hoverCity = null;
  // 시군 패널에서 진입한 경우 그 시군을 pin (우측 aside 카드 즉시 표시)
  exploreState.pinnedCity = pinCityId || null;
  renderExploreSidebar();
  const hash = indicatorKey ? `#explore/${indicatorKey}` : '#explore';
  showOverlayScreen('explore-screen', hash);
  if (exploreState.activeKey) {
    renderExploreDetail(exploreState.activeKey);
  } else {
    renderExploreAside();
  }
}

/**
 * 좌측 사이드바 — 카테고리 트리 (collapsible 4그룹)
 */
function renderExploreSidebar() {
  const tree = document.getElementById('explore-cat-tree');
  if (!tree) return;
  const q = exploreState.search;
  const groups = [
    { id: 'samlter', label: '🏘️ 삶터', icon: '🏘️',
      keys: Object.keys(INDICATORS).filter(k => INDICATORS[k].category === 'samlter') },
    { id: 'ilter',   label: '🌾 일터', icon: '🌾',
      keys: Object.keys(INDICATORS).filter(k => INDICATORS[k].category === 'ilter') },
    { id: 'shimter', label: '🌲 쉼터', icon: '🌲',
      keys: Object.keys(INDICATORS).filter(k => INDICATORS[k].category === 'shimter') },
    { id: 'jayul',   label: '🎯 자율지표', icon: '🎯',
      keys: Object.keys(JAYUL_INDICATORS_POOL) },
  ];
  tree.innerHTML = groups.map(g => {
    const collapsed = exploreState.catCollapsed[g.id] === true;
    // 검색 필터링
    const visibleKeys = g.keys.filter(k => {
      if (!q) return true;
      const meta = INDICATORS[k] || JAYUL_INDICATORS_POOL[k];
      return k.toLowerCase().includes(q) || (meta.name || '').toLowerCase().includes(q);
    });
    if (q && visibleKeys.length === 0) return '';  // 검색 중에 빈 그룹은 숨김
    const expandedAttr = collapsed && !q ? 'false' : 'true';
    const listStyle = (collapsed && !q) ? ' style="display:none"' : '';
    return `
      <div class="explore-cat-group" data-cat="${g.id}">
        <button class="explore-cat-header" type="button" aria-expanded="${expandedAttr}">
          <span class="cat-header-label">${g.label}</span>
          <span class="cat-header-count">${visibleKeys.length}</span>
          <span class="cat-header-icon">${(collapsed && !q) ? '▶' : '▼'}</span>
        </button>
        <ul class="explore-cat-list"${listStyle}>
          ${visibleKeys.map(k => {
            const meta = INDICATORS[k] || JAYUL_INDICATORS_POOL[k];
            const isActive = k === exploreState.activeKey;
            const catCls = meta.category ? `cat-${meta.category}` : '';
            return `
              <li class="explore-ind-item ${isActive ? 'is-active' : ''}" data-key="${k}" role="button" tabindex="0">
                <span class="explore-ind-key ${catCls}">${k}</span>
                <span class="explore-ind-name">${meta.name}</span>
              </li>`;
          }).join('')}
        </ul>
      </div>`;
  }).join('');
  // 그룹 헤더 클릭 → 접힘/펼침
  tree.querySelectorAll('.explore-cat-header').forEach(h => {
    h.addEventListener('click', () => {
      const cat = h.parentElement.dataset.cat;
      exploreState.catCollapsed[cat] = !exploreState.catCollapsed[cat];
      renderExploreSidebar();
    });
  });
  // 지표 항목 클릭
  tree.querySelectorAll('.explore-ind-item').forEach(item => {
    item.addEventListener('click', () => {
      const key = item.dataset.key;
      exploreState.activeKey = key;
      exploreState.hoverCity = null;
      exploreState.pinnedCity = null;
      renderExploreSidebar();
      renderExploreDetail(key);
      renderExploreAside();
      history.replaceState(null, '', `#explore/${key}`);
    });
  });
}

/**
 * 가운데 메인 패널 렌더 — 헤더 / 큰 지도 / 산식(접힘) / 표 / 차트
 */
function renderExploreDetail(key) {
  const detail = document.getElementById('explore-main-panel');
  const meta   = getIndicatorMeta(key);
  if (!detail || !meta) return;

  const catCls = meta.category ? `cat-${meta.category}` : '';
  const catLabel = { samlter: '삶터', ilter: '일터', shimter: '쉼터' }[meta.category] || '';
  const dirLabel = meta.higherBetter ? '높을수록 좋음' : '낮을수록 좋음';
  const isJayul = isJayulKey(key);

  const formula = ({
    L1: '(현재인구 − 전년인구) ÷ 전년인구 × 100',
    L2: '65세이상 인구 ÷ 0–14세 인구 × 100 <em>(SGIS aged_child_idx 직접 제공)</em>',
    L3: '(전입 − 전출) ÷ 총인구 × 1000',
    W2: 'SGIS company.json — corp_cnt (전산업 합계)',
    W6: '20~39세 귀농가구원수 ÷ 전체 귀농가구원수 × 100 <em>(KOSIS·귀농어귀촌인통계 표의 「30대이하」 열 = 본 확정안의 20~39세 구간)</em>',
    W8: '도소매(G) 종사자 + 숙박음식(I) 종사자',
  })[key] || (isJayul
    ? '(현재 mock — 시군이 자율적으로 선정·실측 입력하는 지표)'
    : '<em>(공통지표 — 현재 mock 데이터, 실측 교체 예정)</em>');
  const sourceText = ({
    L1: 'KOSIS · 주민등록인구통계 (행정안전부, 월간 갱신) — 자동 계산',
    L2: 'SGIS · 인구주택총조사 주요지표',
    L3: 'KOSIS · 국내인구이동통계',
    W2: 'SGIS · 전국사업체조사 (전산업 합계)',
    W6: '남양주: `0427_데이터/일터/귀농인현황_남양주.xlsx` → `import_0427_data.py`가 `region-meta`에 병합. 타 시군은 목업·수동 입력 예정.',
    W8: 'SGIS · 사업체조사 산업분류별 (도매소매 + 숙박음식)',
  })[key] || (isJayul
    ? '향후 시군별 실측 또는 외부 출처 (수동 입력)'
    : '향후 통계 출처에서 수집 예정 (현재 예시값)');

  // 시군별 데이터 수집
  const rows = Object.keys(CITIES).map(cid => {
    const city = CITIES[cid];
    const value = getCityIndicatorValue(cid, key);
    const rawDetails = getIndicatorRawDetails(cid, key);
    const isSelected = isJayul && Array.isArray(city.selectedJayulKeys) && city.selectedJayulKeys.includes(key);
    return { cityId: cid, cityName: city.name, value, rawDetails, isSelected };
  });
  const sortKey = exploreState.sortBy;
  const dir = exploreState.sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (sortKey === 'name') return a.cityName.localeCompare(b.cityName, 'ko') * dir;
    const va = (a.value == null ? -Infinity : a.value);
    const vb = (b.value == null ? -Infinity : b.value);
    return (va - vb) * dir;
  });
  // 등급 (값 기반)
  const validRows = rows.filter(r => r.value != null);
  const byValueDesc = [...validRows].sort((a, b) => b.value - a.value);
  validRows.forEach(r => {
    const idx = byValueDesc.findIndex(x => x.cityId === r.cityId) + 1;
    r.qclass = getQuantileClass(idx, validRows.length);
    r.valueRank = idx;
  });

  const unitDisplay = meta.unit || '';
  const spatialDisplay = meta.spatial || '시군';
  const yearDisplay = meta.year ? `${meta.year}년` : '';

  // ── 상단 헤더 ──
  // ── 큰 코로플레스 지도 + 범례 ──
  // ── 산식 (접힘) ──
  // ── 표 (한국어 raw + zebra + 상위 강조) ──
  // ── 차트 ──
  detail.innerHTML = `
    <header class="explore-map-header">
      <span class="explore-key-badge ${catCls}">${key}</span>
      <div class="explore-map-title">
        <h2>${meta.name}</h2>
        <div class="explore-map-meta">
          ${catLabel ? `<span class="explore-cat-chip ${meta.category}">${catLabel}</span>` : ''}
          ${isJayul ? '<span class="explore-cat-chip explore-cat-chip--jayul">자율지표</span>' : '<span class="explore-cat-chip explore-cat-chip--common">공통지표</span>'}
          <span class="explore-meta-chip">${unitDisplay ? unitDisplay + ' · ' : ''}${spatialDisplay}${yearDisplay ? ' · ' + yearDisplay : ''} · ${dirLabel}</span>
        </div>
      </div>
      <button class="btn-primary explore-show-on-map-btn" id="explore-show-on-map" type="button">🗺️ 지도에서 보기</button>
    </header>

    <div class="explore-map-wrap">
      <div id="explore-map-area" aria-label="${meta.name} 코로플레스 지도"></div>
      <div class="explore-legend">
        <span class="legend-title">5분위 등급 <span class="legend-method">동일 개수 분위 (Quintile)</span></span>
        <div class="legend-bar">
          <span class="legend-tier" style="background:${QUANTILE_COLORS[0]}">1</span>
          <span class="legend-tier" style="background:${QUANTILE_COLORS[1]}">2</span>
          <span class="legend-tier" style="background:${QUANTILE_COLORS[2]}">3</span>
          <span class="legend-tier" style="background:${QUANTILE_COLORS[3]}">4</span>
          <span class="legend-tier" style="background:${QUANTILE_COLORS[4]}">5</span>
        </div>
        <span class="legend-hint">${meta.higherBetter ? '값↑ = 좋음' : '값↓ = 좋음'} · 15시군을 값 기준 정렬 후 5등분 (각 등급 3개)</span>
      </div>
    </div>

    <details class="explore-formula-collapsible">
      <summary>📐 산식 · 출처 · 등급 산정 방식 보기</summary>
      <div class="explore-formula-body">
        <p><strong>산식</strong> ${formula}</p>
        <p><strong>출처</strong> ${sourceText}</p>
        <p><strong>등급 산정</strong> 동일 개수 5분위 (Quintile) — 15개 시군을 값 기준으로 정렬한 후 등급별 3개씩 분배. <em>네추럴 브레이크(Jenks)가 아닌 단순 순위 분위입니다.</em></p>
      </div>
    </details>

    <section class="explore-table-section">
      <h3 class="explore-section-title">📋 15개 시군 비교</h3>
      <div class="explore-table-wrap">
        <table class="explore-table" id="explore-table">
          <thead>
            <tr>
              <th>순위</th>
              <th class="sortable" data-sort="name">시군</th>
              <th class="sortable ${sortKey==='value' ? (exploreState.sortDir==='asc'?'sort-asc':'sort-desc'):''} num-cell" data-sort="value">${meta.name}${unitDisplay ? ` (${unitDisplay})` : ''}</th>
              <th>계산 데이터</th>
              <th>등급</th>
              ${isJayul ? '<th>선정</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
              const rankBadge = (r.valueRank === 1) ? '👑' : (r.valueRank === 2) ? '🥈' : (r.valueRank === 3) ? '🥉' : (r.valueRank || (i+1));
              const isTop = r.valueRank && r.valueRank <= 3;
              const shortRaw = getRawShortLabel(key, r.rawDetails);
              return `
                <tr data-city-id="${r.cityId}" class="${isTop ? 'is-top' : ''}">
                  <td class="rank-cell">${rankBadge}</td>
                  <td><strong>${r.cityName}</strong></td>
                  <td class="num-cell">${r.value == null ? '-' : (typeof r.value === 'number' ? r.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : r.value)}</td>
                  <td class="raw-col">${shortRaw || '<span class="raw-mock">(mock)</span>'}</td>
                  <td>${r.qclass ? `<span class="quantile-chip" style="background:${QUANTILE_COLORS[r.qclass-1]}">${r.qclass}</span>` : '-'}</td>
                  ${isJayul ? `<td>${r.isSelected ? '<span class="jayul-selected-mark">✓</span>' : '<span class="jayul-not-selected">-</span>'}</td>` : ''}
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="explore-chart-section">
      <h3 class="explore-section-title">📊 시군별 분포</h3>
      <div class="explore-chart"><canvas id="explore-bar-canvas"></canvas></div>
    </section>
  `;

  // 큰 지도 렌더
  renderExploreMainMap(key, rows);
  renderExploreBarChart(key, rows);

  // 상태 저장 — aside 갱신용
  exploreState._rows = rows;
  exploreState._meta = meta;
  exploreState._key  = key;

  // 표 이벤트
  detail.querySelectorAll('.explore-table tbody tr').forEach(tr => {
    tr.addEventListener('mouseenter', () => {
      exploreState.hoverCity = tr.dataset.cityId;
      renderExploreAside();
      // 지도 폴리곤 강조
      highlightMainMapCity(tr.dataset.cityId);
    });
    tr.addEventListener('mouseleave', () => {
      exploreState.hoverCity = null;
      renderExploreAside();
      highlightMainMapCity(null);
    });
    tr.addEventListener('click', () => {
      exploreState.pinnedCity = tr.dataset.cityId;
      renderExploreAside();
    });
  });
  // 정렬 헤더
  detail.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const newSort = th.dataset.sort;
      if (exploreState.sortBy === newSort) {
        exploreState.sortDir = exploreState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        exploreState.sortBy = newSort;
        exploreState.sortDir = 'desc';
      }
      renderExploreDetail(key);
    });
  });
  // "지도에서 보기"
  const showBtn = document.getElementById('explore-show-on-map');
  if (showBtn) {
    showBtn.addEventListener('click', () => {
      state.activeIndicator = key;
      hideAllOverlayScreens();
      document.getElementById('landing-screen')?.classList.add('is-hidden');
      const dashboard = document.getElementById('app-screen');
      if (dashboard) dashboard.classList.remove('hidden');
      const sel = document.getElementById('indicator-selector');
      if (sel) {
        const opt = Array.from(sel.options).find(o => o.value === key);
        if (opt) { sel.value = key; sel.dispatchEvent(new Event('change')); }
      }
      if (typeof updateMapColors === 'function') updateMapColors();
      history.pushState(null, '', '#dashboard');
    });
  }

  // 우측 aside 초기 렌더
  renderExploreAside();
}

// 메인 지도에서 시군 폴리곤 강조 (호버 시)
function highlightMainMapCity(cityId) {
  const svg = document.querySelector('#explore-map-area svg');
  if (!svg) return;
  svg.querySelectorAll('path[data-city-id]').forEach(p => {
    if (cityId && p.dataset.cityId === cityId) {
      p.style.stroke = '#1A3D27';
      p.style.strokeWidth = '2.5';
      p.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))';
    } else {
      p.style.stroke = '#fff';
      p.style.strokeWidth = '1';
      p.style.filter = '';
    }
  });
}

/**
 * 우측 aside 렌더 — 시군 카드 또는 TOP3 미리보기
 */
function renderExploreAside() {
  const aside = document.getElementById('explore-aside');
  if (!aside) return;
  const key  = exploreState._key;
  const meta = exploreState._meta;
  const rows = exploreState._rows;
  if (!key || !meta || !rows) {
    aside.innerHTML = `
      <div class="explore-aside-empty">
        <span class="explore-aside-emoji">🏙️</span>
        <p>좌측에서 지표를 선택하면<br/>여기에 상세 정보가 표시됩니다</p>
      </div>`;
    return;
  }

  // 표시할 시군: pinnedCity > hoverCity > null (TOP3)
  const focusCityId = exploreState.pinnedCity || exploreState.hoverCity;
  if (focusCityId) {
    const r = rows.find(x => x.cityId === focusCityId);
    if (r) {
      const valStr = r.value == null ? '-'
        : (typeof r.value === 'number' ? r.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : r.value);
      const rankStr = r.valueRank ? `15시군 중 ${r.valueRank}위` : '-';
      const qcolor = r.qclass ? QUANTILE_COLORS[r.qclass-1] : '#888';
      const rawItems = getRawHumanLabels(key, r.rawDetails);
      const rawHTML = rawItems.length
        ? `<div class="explore-raw-block">
             <h4>📊 계산 데이터</h4>
             ${rawItems.map(it => `
               <div class="raw-item ${it.highlight ? 'raw-item--highlight' : ''}">
                 <span class="raw-label">${it.label}</span>
                 <span class="raw-value">${it.value}</span>
               </div>
               ${it.note ? `<div class="raw-note">${it.note}</div>` : ''}
             `).join('')}
           </div>`
        : '<p class="raw-empty-note">raw 데이터 없음 (mock 또는 외부 출처)</p>';

      aside.innerHTML = `
        <div class="explore-city-card">
          <div class="explore-city-card-header">
            ${r.valueRank ? `<span class="explore-city-rank">${r.valueRank}위</span>` : ''}
            <h3>🏙️ ${r.cityName}</h3>
          </div>
          <div class="explore-city-value-big">
            ${valStr} <span class="unit">${meta.unit || ''}</span>
          </div>
          <div class="explore-city-context">
            ${rankStr}
            ${r.qclass ? `<span class="explore-city-quantile" style="background:${qcolor}">${r.qclass}등급</span>` : ''}
          </div>
          ${rawHTML}
          <button class="btn-outline explore-city-go-btn" data-city-deep="${r.cityId}" type="button">🔍 이 시군 자세히 보기</button>
          <p class="explore-aside-hint">${exploreState.pinnedCity ? '클릭 고정됨' : '마우스 따라 변경'} ${exploreState.pinnedCity ? '<button class="explore-unpin" type="button">고정 해제</button>' : ''}</p>
        </div>`;
      // 이벤트
      aside.querySelector('.explore-city-go-btn')?.addEventListener('click', () => {
        const cid = aside.querySelector('.explore-city-go-btn').dataset.cityDeep;
        hideAllOverlayScreens();
        document.getElementById('landing-screen')?.classList.add('is-hidden');
        const dashboard = document.getElementById('app-screen');
        if (dashboard) dashboard.classList.remove('hidden');
        if (typeof selectCity === 'function') selectCity(cid);
        history.pushState(null, '', '#dashboard');
      });
      aside.querySelector('.explore-unpin')?.addEventListener('click', () => {
        exploreState.pinnedCity = null;
        renderExploreAside();
      });
      return;
    }
  }

  // 미선택 시 — TOP 3 + 평균
  const valid = rows.filter(r => r.value != null);
  const sorted = [...valid].sort((a,b) => b.value - a.value);
  const top3 = sorted.slice(0, 3);
  const avg = valid.length ? valid.reduce((s,r) => s + r.value, 0) / valid.length : 0;
  aside.innerHTML = `
    <div class="explore-aside-prompt">
      <span class="explore-aside-emoji">👈</span>
      <h4>지도에서 시군을 골라보세요</h4>
      <p>마우스를 올리거나 클릭하면 상세 정보가 표시됩니다.</p>
    </div>
    <div class="explore-aside-top3">
      <h4>🏆 상위 3개 시군</h4>
      ${top3.map((r, i) => {
        const emoji = ['👑','🥈','🥉'][i] || '';
        const v = r.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        return `
          <button class="explore-aside-top-row" data-city-id="${r.cityId}" type="button">
            <span class="top-emoji">${emoji}</span>
            <span class="top-name">${r.cityName}</span>
            <span class="top-value">${v}${meta.unit ? ' ' + meta.unit : ''}</span>
          </button>`;
      }).join('')}
      <div class="explore-aside-avg">
        <span class="avg-label">15시군 평균</span>
        <span class="avg-value">${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}${meta.unit ? ' ' + meta.unit : ''}</span>
      </div>
    </div>`;
  aside.querySelectorAll('.explore-aside-top-row').forEach(btn => {
    btn.addEventListener('click', () => {
      exploreState.pinnedCity = btn.dataset.cityId;
      renderExploreAside();
      highlightMainMapCity(btn.dataset.cityId);
    });
  });
}

/**
 * 메인 지도 — 큰 SVG 코로플레스 (호버/클릭 + 라벨)
 */
let _exploreMainMapGeo = null;  // GeoJSON 캐시
async function renderExploreMainMap(key, rows) {
  const host = document.getElementById('explore-map-area');
  if (!host) return;
  host.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:var(--space-3)">지도 로딩 중…</div>';
  try {
    if (!_exploreMainMapGeo) {
      const resp = await fetch('./dat/gyeonggi-sigun.geojson', { cache: 'no-cache' });
      _exploreMainMapGeo = await resp.json();
    }
    const geo = _exploreMainMapGeo;
    // 값 매핑 + 등급 매핑
    const valById  = {};
    const rankById = {};
    rows.forEach(r => {
      if (r.value != null) valById[r.cityId] = r.value;
      if (r.qclass) rankById[r.cityId] = r.qclass;
    });
    const meta = getIndicatorMeta(key);
    const higherBetter = meta?.higherBetter !== false;

    // 색상: 등급 기반 (1=가장 좋음 = 진한 녹색)
    const colorFor = (cid) => {
      const q = rankById[cid];
      if (!q) return '#e5e5e5';
      // higherBetter=false 면 등급 반전 (높은 값 = 나쁨)
      const tier = higherBetter ? q : 6 - q;
      return QUANTILE_COLORS[Math.min(4, Math.max(0, tier - 1))];
    };

    // SVG 프로젝션 (큰 지도 — 720×560)
    const W = 720, H = 560;
    const bb = { minLng: 126.4, maxLng: 127.85, minLat: 36.85, maxLat: 38.30 };
    const proj = ([lng, lat]) => [
      ((lng - bb.minLng) / (bb.maxLng - bb.minLng)) * W,
      H - ((lat - bb.minLat) / (bb.maxLat - bb.minLat)) * H,
    ];
    const pathFromCoords = (coords, type) => {
      const rings = type === 'Polygon' ? coords : coords.flat();
      return rings.map(ring => 'M' + ring.map(pt => proj(pt).map(n => n.toFixed(1)).join(',')).join(' L') + ' Z').join(' ');
    };
    const polyCentroid = (coords, type) => {
      // 단순 평균 centroid (큰 폴리곤은 첫 ring)
      const ring = (type === 'Polygon' ? coords[0] : coords[0][0]);
      const [sx, sy] = ring.reduce(([sx, sy], pt) => {
        const [x, y] = proj(pt);
        return [sx + x, sy + y];
      }, [0, 0]);
      return [sx / ring.length, sy / ring.length];
    };

    const svgParts = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img">`];
    // 폴리곤 — 대상 15시군은 색상, 비대상은 매우 흐린 회색 (배경 컨텍스트만)
    geo.features.forEach(f => {
      const cid = f.properties.id;
      const c = f.geometry;
      if (!c || !c.coordinates) return;
      const d = pathFromCoords(c.coordinates, c.type);
      const v = valById[cid];
      const isTarget = !!CITIES[cid];
      const fill = isTarget ? colorFor(cid) : '#e8ece4';
      const stroke = isTarget ? '#fff' : '#d6dccd';
      const strokeWidth = isTarget ? '1' : '0.5';
      const opacity = isTarget ? '1' : '0.5';
      const cityName = CITIES[cid]?.name || '';
      const valStr = v == null ? '-' : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
      const titleText = isTarget
        ? `${cityName}: ${valStr}${meta?.unit ? ' ' + meta.unit : ''}`
        : '(대상 외 시군)';
      svgParts.push(
        `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" data-city-id="${cid}" data-target="${isTarget}"><title>${titleText}</title></path>`
      );
    });
    // 라벨 — 대상 15시군만, 비대상은 라벨 X
    geo.features.forEach(f => {
      const cid = f.properties.id;
      const c = f.geometry;
      if (!c || !c.coordinates) return;
      if (!CITIES[cid]) return;  // 비대상 시군은 라벨 X
      const v = valById[cid];
      const [cx, cy] = polyCentroid(c.coordinates, c.type);
      const cityName = CITIES[cid].name;
      const valStr = v == null ? '' : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
      svgParts.push(
        `<g pointer-events="none" class="explore-map-label">` +
        `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="10.5" font-weight="700" fill="#1a3320" text-anchor="middle" stroke="#fff" stroke-width="2.5" paint-order="stroke">${cityName}</text>` +
        (valStr ? `<text x="${cx.toFixed(1)}" y="${(cy+12).toFixed(1)}" font-size="9.5" font-weight="600" fill="#345140" text-anchor="middle" stroke="#fff" stroke-width="2" paint-order="stroke">${valStr}</text>` : '') +
        `</g>`
      );
    });
    svgParts.push('</svg>');
    host.innerHTML = svgParts.join('');

    // 호버/클릭 이벤트 — 대상 15시군만
    host.querySelectorAll('path[data-target="true"]').forEach(p => {
      const cid = p.dataset.cityId;
      p.style.cursor = 'pointer';
      p.style.transition = 'opacity 0.15s';
      p.addEventListener('mouseenter', () => {
        exploreState.hoverCity = cid;
        renderExploreAside();
        highlightMainMapCity(cid);
      });
      p.addEventListener('mouseleave', () => {
        exploreState.hoverCity = null;
        renderExploreAside();
        highlightMainMapCity(null);
      });
      p.addEventListener('click', () => {
        exploreState.pinnedCity = cid;
        renderExploreAside();
      });
    });
    // 비대상 시군은 클릭/호버 비활성
    host.querySelectorAll('path[data-target="false"]').forEach(p => {
      p.style.cursor = 'default';
      p.style.pointerEvents = 'none';
    });
  } catch (e) {
    host.innerHTML = `<p style="font-size:12px;color:var(--text-muted);padding:var(--space-3)">지도 로드 실패: ${e.message}</p>`;
  }
}

/**
 * Chart.js 막대 차트 — 시군별 지표값
 */
function renderExploreBarChart(key, rows) {
  if (typeof Chart === 'undefined') return;
  if (exploreState.chart) {
    try { exploreState.chart.destroy(); } catch(_) {}
    exploreState.chart = null;
  }
  const canvas = document.getElementById('explore-bar-canvas');
  if (!canvas) return;
  const meta = getIndicatorMeta(key);
  const catColor = ({
    samlter: '#4A90D9', ilter: '#E8A44A', shimter: '#52A866',
  })[meta?.category] || '#2D5F3F';
  const data = rows.filter(r => r.value != null);
  exploreState.chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(r => r.cityName),
      datasets: [{
        label: meta?.name || key,
        data: data.map(r => r.value),
        backgroundColor: catColor + 'CC',
        borderColor: catColor,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString(undefined,{maximumFractionDigits:2})}${meta?.unit ? ' ' + meta.unit : ''}`,
          },
        },
      },
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45 } },
        y: { beginAtZero: false, ticks: { font: { size: 10 } } },
      },
    },
  });
}

/**
 * 탐색 페이지 초기화 — 검색 이벤트 1회 binding (사이드바 클릭은 renderExploreSidebar 내부에서 매번 재바인딩)
 */
function initExploreScreen() {
  if (exploreState.initialized) return;
  const searchInput = document.getElementById('explore-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      exploreState.search = (searchInput.value || '').trim().toLowerCase();
      renderExploreSidebar();
    });
  }
  exploreState.initialized = true;
}

/**
 * 오버레이 페이지 내부 인터랙션 초기화 — 한 번만 호출
 */
function initOverlayScreens() {
  // 닫기 버튼 / 로고 클릭 → 뒤로가기
  document.querySelectorAll('.overlay-screen').forEach(screen => {
    screen.querySelectorAll('[data-overlay-close], .overlay-brand').forEach(btn => {
      btn.addEventListener('click', () => {
        // hash가 있으면 history.back으로 자연스럽게, 없으면 직접 복귀
        if (location.hash && location.hash !== '#') {
          history.back();
        } else {
          hideAllOverlayScreens();
          returnToLanding();
        }
      });
    });
  });

  // 랭킹 탭 클릭
  const rankingScreen = document.getElementById('ranking-screen');
  if (rankingScreen) {
    rankingScreen.querySelectorAll('.ranking-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        rankingScreen.querySelectorAll('.ranking-tab').forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        renderRankingPage(tab.dataset.cat);
      });
    });
  }

  // ESC로 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const anyOpen = Array.from(document.querySelectorAll('.overlay-screen'))
      .some(el => !el.classList.contains('is-hidden'));
    if (anyOpen) {
      if (location.hash && location.hash !== '#') history.back();
      else { hideAllOverlayScreens(); returnToLanding(); }
    }
  });
}

// ===================================================================
// === 지도 컨텍스트 HUD + 선택 토스트 ===
// ===================================================================

/**
 * 지도 컨텍스트 HUD 업데이트
 * - zoom 11+ 에서 현재 뷰포트 중심이 속하는 시군(·읍면) 이름을 지도 위에 표시
 * - state.selected* 가 있으면 그것을 우선 사용 (bbox 탐지보다 정확)
 * - zoom < 11 이면 HUD 숨김 (시군 라벨이 이미 잘 보이는 줌 레벨)
 */
function updateMapContextHud() {
  const hud = document.getElementById('map-context-hud');
  if (!hud || !map) return;

  const zoom = map.getZoom();
  if (zoom < DONG_ZOOM_THRESHOLD) {
    hud.classList.add('is-hidden');
    return;
  }

  const center = map.getCenter();

  // ── 1. 시군 이름 결정 (state 우선, 없으면 viewport bbox 탐지) ──
  let cityName = '';
  if (state.selectedCity && CITIES[state.selectedCity]) {
    cityName = CITIES[state.selectedCity].name;
  } else {
    // geoJsonFeatures bbox 체크 (정확도보다 속도 우선)
    for (const [cityId, layer] of Object.entries(geoJsonFeatures)) {
      try {
        if (layer.getBounds().contains(center)) {
          cityName = CITIES[cityId] ? CITIES[cityId].name : cityId;
          break;
        }
      } catch (_) { /* feature 아직 로드 안 됨 */ }
    }
  }

  // ── 2. 읍면 이름 결정 (zoom 13+, state 우선 → bbox 탐지) ──
  let dongName = '';
  if (zoom >= RI_ZOOM_THRESHOLD && dongLayer) {
    if (state.selectedDong) {
      // state에서 이름 조회 (dongLayer feature 검색)
      dongLayer.eachLayer(l => {
        const p = l.feature && l.feature.properties;
        if (p && p.adm_cd === state.selectedDong) dongName = p.adm_nm || '';
      });
    }
    if (!dongName) {
      // viewport 중심 bbox 탐지
      dongLayer.eachLayer(l => {
        if (dongName) return; // 이미 찾았으면 스킵
        try {
          if (l.getBounds().contains(center)) {
            const p = l.feature && l.feature.properties;
            dongName = (p && p.adm_nm) || '';
          }
        } catch (_) {}
      });
    }
  }

  // ── 3. HUD 렌더 ──
  if (!cityName && !dongName) {
    hud.classList.add('is-hidden');
    return;
  }
  hud.classList.remove('is-hidden');
  let html = '📍 ' + (cityName || '경기도');
  if (dongName) {
    html += `<span class="hud-sep">›</span><span class="hud-dong">${dongName}</span>`;
  }
  hud.innerHTML = html;
}

/**
 * 지도 위 선택 레벨 플래시 토스트
 * @param {string} emoji   - 레벨 이모지 (🏙️/📍/🏘️)
 * @param {string} name    - 선택된 이름 (예: '청평면')
 * @param {string} level   - 레벨 한글 (예: '읍면')
 */
function showMapSelectToast(emoji, name, level) {
  const el = document.getElementById('map-select-toast');
  if (!el) return;
  // 진행 중인 타이머 취소
  if (el._hideTimer)  { clearTimeout(el._hideTimer);  el._hideTimer  = null; }
  if (el._fadeTimer)  { clearTimeout(el._fadeTimer);  el._fadeTimer  = null; }

  el.textContent = `${emoji} ${name} (${level} 선택됨)`;
  el.classList.remove('is-hidden', 'is-fading');

  // 1.6s 후 fade-out 시작
  el._fadeTimer = setTimeout(() => {
    el.classList.add('is-fading');
    // 0.5s 후 완전히 숨김
    el._hideTimer = setTimeout(() => el.classList.add('is-hidden'), 500);
  }, 1600);
}

// ===================================================================
// === 지도/패널 드래그 구분선 (데스크톱 전용) ===
// ===================================================================

/**
 * #map-container 와 #detail-panel 사이 드래그 리사이저 초기화
 * - 좌우로 드래그해 지도·패널 너비 비율을 실시간 조절
 * - 모바일(flex-direction: column) 상태에서는 무동작
 */
function initPanelResizer() {
  const resizer = document.getElementById('panel-resizer');
  const layout  = document.getElementById('main-layout');
  const mapCont = document.getElementById('map-container');
  if (!resizer || !layout || !mapCont) return;

  let dragging = false;
  let startX   = 0;
  let startW   = 0;

  resizer.addEventListener('pointerdown', (e) => {
    // 세로 레이아웃(모바일)에서는 무시
    if (window.getComputedStyle(layout).flexDirection === 'column') return;
    dragging = true;
    startX   = e.clientX;
    startW   = mapCont.getBoundingClientRect().width;
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('is-dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  resizer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const totalW = layout.getBoundingClientRect().width;
    const dx     = e.clientX - startX;
    // 최소 260px, 최대 totalW - 280px 범위로 제한
    const newW   = Math.max(260, Math.min(totalW - 280, startW + dx));
    mapCont.style.flex = `0 0 ${newW}px`;
    // Leaflet 지도 크기 즉시 반영
    if (map) map.invalidateSize({ animate: false });
  });

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('is-dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    if (map) map.invalidateSize();
  };

  resizer.addEventListener('pointerup',     stopDrag);
  resizer.addEventListener('pointercancel', stopDrag);
}

// ===================================================================
// === 앱 초기화 진입점 ===
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  initLandingScreen(); // 랜딩 화면 — 가장 먼저 실행
  initOverlayScreens(); // 랭킹/가이드 오버레이 인터랙션 (닫기·탭·ESC)

  // 헤더 로고 클릭 → 랜딩 복귀 (해시 제거 = 뒤로가기와 동일 효과)
  const headerBrand = document.getElementById('header-brand');
  if (headerBrand) {
    headerBrand.addEventListener('click', () => history.back());
  }

  // 읍면 상세 → 시군 보기 복귀 버튼
  const dongBackBtn = document.getElementById('dong-back-btn');
  if (dongBackBtn) {
    dongBackBtn.addEventListener('click', () => clearDongSelection());
  }

  // 행정리 상세 → 읍면 보기 복귀 버튼
  const riBackBtn = document.getElementById('ri-back-btn');
  if (riBackBtn) {
    riBackBtn.addEventListener('click', () => clearRiSelection());
  }

  // 시군 패널 닫기 (닫기 버튼 + 배경 클릭)
  const panelCloseBtn = document.getElementById('landing-city-panel-close');
  const panelBackdrop = document.getElementById('city-panel-backdrop');
  if (panelCloseBtn) panelCloseBtn.addEventListener('click', hideCityPanel);
  if (panelBackdrop) panelBackdrop.addEventListener('click', hideCityPanel);

  // ESC 키로 패널 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCityPanel();
  });

  // 지도/패널 드래그 리사이저
  initPanelResizer();

  // KOSIS 기본 통계 토글 (시군 패널 맨 아래 접힘 섹션)
  initKosisToggle();

  // 일반/관리자 뷰 토글 (피드백 #6)
  initViewModeToggle();

  // 우측 패널 지표 카드 / 자율지표 카드 클릭 → 지표 탐색 페이지 열기 (이벤트 위임)
  const cityDetailEl = document.getElementById('city-detail');
  if (cityDetailEl) {
    cityDetailEl.addEventListener('click', (e) => {
      // 현재 선택된 시군 — pin 으로 전달해 탐색 페이지에서 미리 강조
      const pinCity = state.selectedCity || null;
      // 공통지표 카드 (HTML 정적 .indicator-card + JS 동적 .indicator-item 모두)
      const common = e.target.closest('.indicator-card, .indicator-item');
      if (common) {
        const key = common.dataset.id
                 || common.dataset.key
                 || common.querySelector('.indicator-id')?.textContent.trim();
        if (key && (INDICATORS[key] || JAYUL_INDICATORS_POOL[key])) {
          showExplorePage(key, pinCity);
          return;
        }
      }
      // 자율지표 카드 (모든 시군에 적용)
      const jayul = e.target.closest('.jayul-ind-card');
      if (jayul) {
        const key = jayul.dataset.key
                 || jayul.querySelector('.jayul-ind-key')?.textContent.trim();
        if (key && (INDICATORS[key] || JAYUL_INDICATORS_POOL[key])) {
          showExplorePage(key, pinCity);
        }
      }
    });
  }

  showLoading();

  try {
    initMap();
    initCharts();
    initTabs();
    initSearch();
    initScenario();
    initLegend();
    initComparisonToggle();
    updateComparisonCityList();
  } catch (err) {
    console.error('[Dashboard] 초기화 오류:', err);
  } finally {
    hideLoading();
  }
});

// ===================================================================
// === 비교 섹션 토글 ===
// ===================================================================

function initComparisonToggle() {
  const toggleBtn = document.getElementById('comparison-toggle-btn');
  const body = document.getElementById('comparison-body');
  if (!toggleBtn || !body) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = !body.classList.contains('hidden');
    body.classList.toggle('hidden', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(!isOpen));
    const arrow = toggleBtn.querySelector('.toggle-arrow');
    if (arrow) arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
    // 차트 열릴 때 강제 갱신
    if (!isOpen) renderComparisonChart();
  });
}
