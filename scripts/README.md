# 데이터 가공 스크립트

행정리(법정리) 경계 SHP을 가공하여 GeoJSON으로 변환하고, KOSIS 통계 API에서 시군 메타정보를 받아오는 스크립트들.

## 의존성 설치

```powershell
# Web/scripts/ 에서 실행
python -m venv venv
venv\Scripts\Activate.ps1     # Windows PowerShell
# source venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
```

> `geopandas`는 GDAL이 필요합니다. Windows에서 문제 발생 시 [OSGeo4W](https://trac.osgeo.org/osgeo4w/) 또는 `conda install -c conda-forge geopandas` 권장.

---

## 1. 행정리 SHP → GeoJSON (`process_ri.py`)

```bash
python process_ri.py "C:/다운로드경로/LSMD_ADM_SECT_RI_41_202605.shp" "../dat/gyeonggi-ri.geojson"
```

**입력**: 국토교통부 `행정구역_리(법정동)` SHP (V-WORLD 다운로드)
- 좌표계: EPSG:5186 (Korea 2000 / Central Belt 2010) · 인코딩: EUC-KR

**출력**: `Web/dat/gyeonggi-ri.geojson`
- 좌표계: EPSG:4326 (WGS84) · 단순화: tolerance 0.0001 (≈10m)
- 15개 시군 중 읍·면 보유 12개만 필터링 (오산·하남·동두천은 동만 있음 → 행정리 없음)
- 속성: `city_id`, `ri_cd`(10자리), `ri_nm`, `dong_cd`(상위 읍면 코드 8자리)

---

## 2. KOSIS API → 시군 통계 (`fetch_kosis.py`)

### 2-1. 사전 준비

1. [KOSIS OpenAPI](https://kosis.kr/openapi/) 회원가입 후 API 키 발급
2. 환경변수 설정:

```powershell
# PowerShell (Web/scripts/ 에서 실행)
$env:KOSIS_API_KEY = "발급받은_키"
python fetch_kosis.py
```

```bash
# macOS/Linux
KOSIS_API_KEY="발급받은_키" python fetch_kosis.py
```

**출력**: `Web/dat/region-meta.json` 자동 갱신

키 없이 실행 시 → placeholder JSON 생성 (사이트는 정상 동작하되 읽어온 데이터 없음).

---

### 2-2. region-meta.json 3-layer 스키마

스크립트가 생성하는 JSON은 다음 3-layer 구조:

```jsonc
{
  "sigun": {
    "namyangju": {
      "raw":      { /* KOSIS 원본 — 매 실행마다 덮어씀 */ },
      "computed": { /* raw로부터 산식 계산값 — 결정론적 재계산 */ },
      "manual":   { /* 사용자 수동 입력 — 스크립트가 보존 */ }
    }
  }
}
```

- **raw**: KOSIS Open API 응답 원본. `{ value, year, source: 'kosis:DT_...' }`
- **computed**: `compute_indicators(raw)`에서 계산. `{ value, unit, formula, inputs }`
- **manual**: 사용자가 직접 편집. `{ value, year, source, updated_by, updated_at }`. `load_existing_manual()`로 보존.

자세한 매핑은 [`docs/KOSIS-MAPPING.md`](../docs/KOSIS-MAPPING.md) 참조.

### 2-3. 현재 활성 테이블 (Tier 1)

| 키 | 테이블명 | orgId | tblId | 파라미터 | 수집 항목 |
|----|---------|-------|-------|---------|---------|
| `sigun_pop` | 행정구역(시군구)별 성별 인구수 | 101 | DT_1B040A3 | `objL1=ALL&itmId=ALL&prdSe=M&newEstPrdCnt=13` | 총인구수 (T20), 13개월 → 현재+전년 |
| `sigun_hh` | 행정구역(시군구)별 주민등록세대수 | 101 | DT_1B040B3 | `objL1=ALL&itmId=ALL&prdSe=M&newEstPrdCnt=1` | 세대수 (T1) |

두 테이블 모두 **15/15 경기도 시군 완전 수집** 확인 (2026-05 기준).

**자동 계산 지표** (`compute_indicators()`):
- `L1_pop_growth_rate`: 인구증가율 = (현재-전년)/전년×100 → 단위 %
- `L3_net_migration_rate`: 인구순이동률 = (전입-전출)/인구×1000 → 단위 ‰ (인구이동 raw 확보 시)

응답 필드 예시 (DT_1B040A3):
```json
{
  "C1": "41360",
  "C1_NM": "남양주시",
  "ITM_ID": "T20",
  "ITM_NM": "총인구수",
  "DT": "728126",
  "PRD_DE": "202604"
}
```

---

### 2-4. 시도 결과 — 비활성 테이블

`fetch_kosis.py`의 `TABLES` dict에 주석으로 보존됨. **검증 결과(2026-05)**:

#### [시도 단위만 제공 — 시군구 breakdown 없음]

| tblId | 표 이름 | 검증 결과 |
|-------|---------|---------|
| DT_1B26001 | 시군구/성/연령(5세)별 이동자수 | C1=시도, C2=성별, C3=연령. `objL1='41'` → 경기도 전체만, 시군구 없음 |
| DT_1C81 | 시도별 지역내총생산 | 1512행, 경기도 시군구 0행. 시도 단위만 |
| DT_1B81A21 | 합계출산율 | C1=KOSIS 내부 시도코드(31=경기), 시군구 없음 |

→ KOSIS 웹 검색에서 시군구별 표 ID 확보 후 재시도 필요. 또는 KOSIS Excel 다운로드 후 `manual` 층에 직접 입력.

#### [40,000셀 초과 — 차원 필터링 필요]

| tblId | 표 이름 | 재시도 방안 |
|-------|---------|------------|
| DT_1IN1502 | 인구통계 노령화지수 | `itmId=<65세이상 코드>,<0-14세 코드>` 특정 지정 |
| DT_1K51003 | 전국사업체조사 시군구 | `objL1=<전산업 합계 코드>` 지정 |
| DT_1B040M1 | 행정구역(읍면동)별 주민등록인구 | 시도별 분할 호출 필요 — 경기도 코드 형식 확인 필요 |

#### [테이블 ID 미확인]

| 시도한 ID | 결과 | 대안 |
|----------|------|------|
| DT_1ET2002 (귀농귀촌) | ERR 21 | KOSIS 웹에서 「귀농귀촌」 검색 → 정확한 tblId 확보 |
| DT_113N_SDK1, DT_113N_M001 등 | ERR 21 | 동상 |

---

### 2-5. 새 테이블 추가 방법

`fetch_kosis.py`는 **1 테이블 = 1 TABLES 항목 + 1 parse_* 함수 + 1 PARSERS 항목** 구조.

```python
# 1. TABLES dict 에 항목 추가
TABLES = {
    'sigun_agri': {
        'orgId': '101', 'tblId': 'DT_농업표ID',
        'prdSe': 'Y',   'newEstPrdCnt': '1',
        'extra': {'itmId': 'ALL'},
        'desc':  '시군구별 농가수 및 경지면적',
    },
}

# 2. 파서 함수 추가 — {city_id: {field: value, _period: str}} 반환
def parse_sigun_agri(rows):
    itm_ids = _discover_itm_ids(rows)
    farm_id = _find_itm_id(itm_ids, ['농가수', '농가'])
    result = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY: continue
        city_id = CODE_TO_CITY[code5]
        ...
        result[city_id] = {'farms': val, '_period': period}
    return result

# 3. fetch_all() 의 PARSERS dict 에 추가
PARSERS = {
    ...,
    'sigun_agri': parse_sigun_agri,
}
```

**3-layer 자동 처리** — 파서가 반환한 데이터는 `merge_all()`이 자동으로 `raw` 층에 wrapping:
```python
sigun[cid]['raw']['farms'] = {
    'value': val,
    'year':  period,
    'source': 'kosis:DT_농업표ID',
}
```

산식 계산 지표 추가 시 `compute_indicators()`에 분기 추가:
```python
def compute_indicators(raw):
    computed = {}
    farms = (raw.get('farms') or {}).get('value')
    population = (raw.get('population') or {}).get('value')
    if farms and population:
        computed['farm_density'] = {
            'value': round(farms / population * 1000, 2),
            'unit': '농가/천명',
            'formula': '농가수 / 인구 × 1000',
            'inputs': {'farms': farms, 'population': population},
        }
    return computed
```

---

### 2-6. 수동 입력값 추가 방법 (manual 층)

KOSIS에 없는 지표(재정자립도, 국가유산 등)는 `region-meta.json`을 직접 편집해 추가:

```jsonc
"sigun": {
  "namyangju": {
    "raw": { /* 건드리지 않음 */ },
    "computed": { /* 건드리지 않음 */ },
    "manual": {
      "W3_fiscal_independence": {
        "value": 38.6,
        "year": "2024",
        "source": "지방재정365",
        "updated_by": "your_name",
        "updated_at": "2026-05-17"
      },
      "R8_heritage_count": {
        "value": 12,
        "year": "2025",
        "source": "문화재청 국가유산포털"
      }
    }
  }
}
```

> `fetch_kosis.py`를 재실행해도 `manual` 층은 `load_existing_manual()`이 읽어 보존함.  
> 키 이름은 [`docs/KOSIS-MAPPING.md`](../docs/KOSIS-MAPPING.md)의 매핑 표 참고.

---

### 2-7. KOSIS API 공통 파라미터

| 파라미터 | 값 | 설명 |
|---------|---|------|
| `method` | `getList` | 데이터 조회 |
| `format` | `json` | 응답 형식 |
| `jsonVD` | `Y` | JSON 값 직접 반환 |
| `prdSe` | `M` (월) / `Y` (연) | 수록 주기 |
| `newEstPrdCnt` | `N` | 최신 N개 기간 (인구증가율 계산엔 `13` 필요) |
| `objL1` | `ALL` | 1차 분류 전체 |
| `itmId` | `ALL` | 항목 전체 |

**SSL 주의**: KOSIS 서버는 self-signed 인증서를 사용함 → `verify=False` 필요 (스크립트에 이미 적용됨, `InsecureRequestWarning` 자동 suppressed).

**에러 코드**:
| 코드 | 의미 | 조치 |
|------|------|------|
| 20 | 필수 파라미터 누락 | `objL1/objL2` 또는 `itmId` 추가. 에러 메시지의 `(objL)` 등 단서 확인 |
| 21 | 잘못된 요청 변수 / 표 없음 | tblId/orgId 또는 objL 값 재확인. 차원 코드는 KOSIS 내부 분류일 수 있음 |
| 30 | 데이터 없음 | 기간 또는 코드 변경 |
| 31 | 40,000셀 초과 | 특정 objL 값으로 필터링하여 데이터 양 감소 |

---

## 시군 코드 매핑표

| 행안부 코드 | 시군 | city_id | 비고 |
|---|---|---|---|
| 41220 | 평택시 | pyeongtaek | |
| 41250 | 동두천시 | dongducheon | 동만 있음 (행정리 없음) |
| 41360 | 남양주시 | namyangju | |
| 41370 | 오산시 | osan | 동만 있음 |
| 41450 | 하남시 | hanam | 동만 있음 |
| 41460 | 용인시 | yongin | |
| 41500 | 이천시 | icheon | |
| 41550 | 안성시 | anseong | |
| 41590 | 화성시 | hwaseong | |
| 41610 | 광주시 | gwangju | |
| 41630 | 양주시 | yangju | |
| 41650 | 포천시 | pocheon | |
| 41670 | 여주시 | yeoju | |
| 41820 | 가평군 | gapyeong | |
| 41830 | 양평군 | yangpyeong | |
