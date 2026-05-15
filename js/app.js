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

const NAMYANGJU_INDICATORS = {
  L5: { name: '귀촌인 증감률',          unit: '%',      category: 'samlter', higherBetter: true, spatial: '시군',   year: 2023 },
  L6: { name: '3년 귀촌 규모 유지율',   unit: '%',      category: 'samlter', higherBetter: true, spatial: '시군',   year: 2023 },
  W5: { name: '농업 세대교체 수준',      unit: '%',      category: 'ilter',   higherBetter: true, spatial: '읍면동', year: 2022 },
  W6: { name: '청년 귀농 유입 비율',     unit: '%',      category: 'ilter',   higherBetter: true, spatial: '시도',   year: 2023 },
  W7: { name: '친환경 인증 농가 비율',   unit: '%',      category: 'ilter',   higherBetter: true, spatial: '시도',   year: 2023 },
  R4: { name: '인구 1천명당 체험 프로그램', unit: '건/천명', category: 'shimter', higherBetter: true, spatial: '읍면', year: 2024 },
  R5: { name: '양호수질 하천 비율',      unit: '%',      category: 'shimter', higherBetter: true, spatial: '읍면',   year: 2023 },
  R6: { name: '수변·생태쉼터 면적',     unit: '㎡/천명', category: 'shimter', higherBetter: true, spatial: '읍면',  year: 2024 },
};

// 카테고리 종합 가상 지표 키 매핑
const CATEGORY_TOTALS = {
  samlter_total: { category: 'samlter', label: '삶터 종합' },
  ilter_total:   { category: 'ilter',   label: '일터 종합' },
  shimter_total:  { category: 'shimter',  label: '쉼터 종합' },
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
    namyangjuIndicators: {
      L5: 12.4, L6: 84.2,
      W5: 18.3, W6: 22.1, W7: 15.8,
      R4: 3.4,  R5: 78.5, R6: 2840,
    },
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
  yeoncheon: {
    id: 'yeoncheon', name: '연천군',
    lat: 38.09, lng: 127.07,
    type: '군',
    description: '최북단 접경, 인구감소 심각, 자연환경 최상급, DMZ 생태',
    indicators: {
      L1: -2.1,  L2: 224,   L3: -9.2,  L4: 36.0,
      W1: 54.1,  W2: 1240,  W3: 8.7,   W4: 2200,
      R1: 74.3,  R2: 1.67,  R3: 85.6,
    },
  },
  paju: {
    id: 'paju', name: '파주시',
    lat: 37.76, lng: 126.78,
    type: '시',
    description: '통일 특수, 출판단지, 인구 증가, LG디스플레이',
    indicators: {
      L1: 1.4,   L2: 118,   L3: 6.8,   L4: 68.0,
      W1: 64.7,  W2: 7320,  W3: 21.3,  W4: 21800,
      R1: 38.6,  R2: 1.36,  R3: 54.7,
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
  gimpo: {
    id: 'gimpo', name: '김포시',
    lat: 37.62, lng: 126.71,
    type: '시',
    description: '최근 인구 급증, 신도시 개발, 한강 수변',
    indicators: {
      L1: 3.1,   L2: 92,    L3: 16.8,  L4: 71.0,
      W1: 63.6,  W2: 9840,  W3: 24.1,  W4: 16400,
      R1: 29.5,  R2: 1.26,  R3: 41.7,
    },
  },
};

// ===================================================================
// === 전역 상태 관리 ===
// ===================================================================

const state = {
  selectedCity: null,
  comparisonCities: [],
  activeTab: 'overview',
  activeIndicator: 'total',
  scenarioValues: {},
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
    .map(city => city.indicators[indicatorKey])
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

  const keys = Object.keys(INDICATORS).filter(k => INDICATORS[k].category === category);
  if (keys.length === 0) return 0;

  const scores = keys.map(key => {
    const indicator = INDICATORS[key];
    const value = city.indicators[key];
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
let labelGroup = null;      // 시군명 라벨 레이어
let outlineLayer = null;    // 대상지(15개 시군) 합쳐진 외곽선 효과 레이어
const DONG_ZOOM_THRESHOLD = 11;

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

  // 줌 변경 시 행정동 가시성 + 라벨 크기 업데이트
  map.on('zoomend', () => {
    updateDongVisibility();
    updateCityLabelSize();
  });
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
        const name = feature.properties.adm_nm || '';
        layer.bindTooltip(name, {
          permanent: false, direction: 'center', className: 'dong-tooltip',
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
    if (!map.hasLayer(dongLayer)) {
      dongLayer.addTo(map);
      dongLayer.bringToFront(); // 시군구 위에 표시
    }
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
    const resp = await fetch(GEOJSON_URL);
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

  // 안내 메시지 숨김, 상세 뷰 표시
  const noMsg = document.getElementById('no-selection-msg');
  if (noMsg) noMsg.style.display = 'none';

  const cityDetail = document.getElementById('city-detail');
  if (cityDetail) cityDetail.classList.remove('hidden');

  updateDetailPanel(cityId);
  updateRadarChart(cityId);
  highlightMarker(cityId);
  updateIndicatorList();

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

  // 비교 추가 버튼
  updateComparisonButton(cityId);

  // 남양주 자율지표 섹션
  updateNamyangjuSection(cityId);
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
function updateNamyangjuSection(cityId) {
  // 기존 자율지표 섹션 제거
  const existing = document.getElementById('namyangju-extra-section');
  if (existing) existing.remove();

  if (cityId !== 'namyangju') return;

  const city = CITIES.namyangju;
  if (!city || !city.namyangjuIndicators) return;

  const cityDetail = document.getElementById('city-detail');
  if (!cityDetail) return;

  const section = document.createElement('div');
  section.id = 'namyangju-extra-section';
  section.className = 'namyangju-section';
  section.innerHTML = `
    <h3 class="section-title namyangju-title">남양주 자율지표</h3>
    <div class="namyangju-indicator-grid">
      ${Object.entries(NAMYANGJU_INDICATORS).map(([key, ind]) => {
        const value = city.namyangjuIndicators[key];
        const catColors = { samlter: '#3498db', ilter: '#e67e22', shimter: '#27ae60' };
        const catColor  = catColors[ind.category] || '#666';
        return `
          <div class="namyangju-ind-card" style="border-left: 3px solid ${catColor};">
            <div class="namyangju-ind-key" style="color:${catColor};">${key}</div>
            <div class="namyangju-ind-name">${ind.name}</div>
            <div class="namyangju-ind-value">${formatValue(value, ind.unit)}</div>
            <div class="namyangju-ind-meta">${ind.spatial} · ${ind.year}년</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  cityDetail.appendChild(section);
}

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
        <div class="indicator-meta">${ind.spatial} · ${ind.year}년 · ${ind.formula}</div>
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

  Object.keys(NAMYANGJU_INDICATORS).forEach(k => {
    base[k] = (cityId === 'namyangju' && city.namyangjuIndicators?.[k] !== undefined)
      ? city.namyangjuIndicators[k]
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
  const labels = Object.values(NAMYANGJU_INDICATORS).map(i => i.name);
  const beforeVals = Object.keys(NAMYANGJU_INDICATORS).map(k => before[k] || 0);
  const afterVals  = Object.keys(NAMYANGJU_INDICATORS).map(k => after[k] || 0);

  // 공통 최대값 (정규화 기준)
  const maxVals = Object.keys(NAMYANGJU_INDICATORS).map((k, i) =>
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
  const allIndicators = { ...INDICATORS, ...NAMYANGJU_INDICATORS };
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
        const def = INDICATORS[k] || NAMYANGJU_INDICATORS[k];
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
    const ind   = INDICATORS[indKey] || NAMYANGJU_INDICATORS[indKey];
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
              const def = INDICATORS[key] || NAMYANGJU_INDICATORS[key];
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
              const def = INDICATORS[r.x] || NAMYANGJU_INDICATORS[r.x];
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

  const mainCta = document.getElementById('landing-cta-main');
  if (mainCta) {
    mainCta.addEventListener('click', () => closeAndAct('map'));
  }

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

  fetch('./dat/gyeonggi-sigun.geojson')
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
  namyangju: { city: '남양주시', indicators: NAMYANGJU_INDICATORS },
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

  // 시군 패널 닫기 (닫기 버튼 + 배경 클릭)
  const panelCloseBtn = document.getElementById('landing-city-panel-close');
  const panelBackdrop = document.getElementById('city-panel-backdrop');
  if (panelCloseBtn) panelCloseBtn.addEventListener('click', hideCityPanel);
  if (panelBackdrop) panelBackdrop.addEventListener('click', hideCityPanel);

  // ESC 키로 패널 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCityPanel();
  });

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
