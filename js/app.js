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
const DONG_ZOOM_THRESHOLD = 11;

/**
 * Leaflet 지도 초기화 및 시군 마커 생성
 */
function initMap() {
  map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: false,
  }).setView([37.55, 127.2], 9);

  // CartoDB Voyager — 한글 라벨 + 밝고 깔끔한 지도 (대시보드에 적합)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

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

  // 줌 변경 시 행정동 가시성 업데이트
  map.on('zoomend', updateDongVisibility);
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

    geoJsonLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: (feature) => {
        const cityId = feature.properties.id;
        return {
          fillColor: cityId ? getCityColor(cityId) : '#ccc',
          color: '#fff',
          weight: 1.5,
          opacity: 0.9,
          fillOpacity: 0.78,
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
            this.setStyle({ fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.78 });
          }
          this.closeTooltip();
        });
      },
    }).addTo(map);

    map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] });
    updateMapColors();

  } catch (err) {
    console.warn('[GeoJSON] 폴리곤 로드 실패 — CircleMarker 유지:', err.message);
  }
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
        layer.setStyle({ fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.78 });
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

  // city-detail도 시나리오 탭일 때 숨김
  const cityDetail = document.getElementById('city-detail');
  if (cityDetail && !cityDetail.classList.contains('hidden')) {
    cityDetail.style.display = tab === 'scenario' ? 'none' : '';
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

  // 1) KPI 카운트업
  initLandingKpiCounters();

  // 2) 미니맵 SVG 렌더 (비동기 — GeoJSON fetch)
  initLandingMinimap();

  // 3) 메인 CTA + Bento 카드 클릭 라우팅
  const closeAndAct = (action) => {
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
      // 준비중 항목은 토스트만
      if (action === 'guide' || action === 'sources') {
        showLandingToast('🛠️ 지표 가이드는 준비 중입니다');
        return;
      }
      if (action === 'ranking') {
        showLandingToast('🛠️ 시군 랭킹 페이지는 준비 중입니다');
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
          const rect = svg.getBoundingClientRect();
          const wrapRect = svg.parentElement.getBoundingClientRect();
          tooltip.style.left = (e.clientX - wrapRect.left + 10) + 'px';
          tooltip.style.top  = (e.clientY - wrapRect.top  - 24) + 'px';
        });
        path.addEventListener('mouseleave', () => {
          if (tooltip) tooltip.classList.remove('is-visible');
        });
        svg.appendChild(path);
      });
    })
    .catch(err => console.warn('[landing minimap] GeoJSON load failed', err));
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
// === 앱 초기화 진입점 ===
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  initLandingScreen(); // 랜딩 화면 — 가장 먼저 실행

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
