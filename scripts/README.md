# 데이터 가공 스크립트

행정리(법정리) 경계 SHP을 가공하여 GeoJSON으로 변환하고, KOSIS·SGIS 통계 API에서 시군 메타정보를 받아오는 스크립트들.

## 파일 구성

| 파일 | 역할 |
|------|------|
| `lib_meta.py` | 공통 모듈 — 3-layer 스키마 관리, 산식 계산, 상수 (`SIGUN_CODES`, `CODE_TO_CITY`) |
| `fetch_kosis.py` | KOSIS Open API → 인구·세대수 갱신 (source='kosis:*') |
| `fetch_sgis.py` | SGIS Open API → 노령화·사업체·농가 등 갱신 (source='sgis:*') |
| `process_ri.py` | 행정리 SHP → GeoJSON 변환 |
| `build_field_survey.py` | 현장조사 xlsx → `dat/simulation/namyangju-field-survey.json` (0531, 9개 농촌 읍면 집계) |

> 두 fetch 스크립트는 **독립 실행 가능**. 자기 source 의 raw 만 갱신하고 다른 source 및 manual 층은 보존.

> ⚠️ **지표 ID 주의(CANON)**: 표준 키는 xlsx 확정안 기준 — W9=농촌체험, R4=양호수질, R5=수변쉼터, R6=도시텃밭, R7=주말농원.
> `namyangju-dong-mock.json` 은 키가 한 칸 밀려 있다(`R4_experience_prog`=W9, `R5_water_quality`=R4, `R6_park_per_capita`=R5).
> `CITIES.namyangju.jayulIndicators` 도 앱 내부 번호(R4=체험·R5=수질·R6=쉼터)를 쓴다.
> 읍면 지표는 **반드시 `app.js`의 `getEupIndicator()` 변환 레이어를 경유**해 조회한다(직접 키 접근 금지).

### build_field_survey.py 실행

```powershell
python build_field_survey.py `
  --xlsx "../../0531작업/현장조사 가상데이터.xlsx" `
  --out  "../dat/simulation/namyangju-field-survey.json" `
  --pop-source "../dat/region-meta.json"
```
산출 지표: W5·W7(농가조사) / L6·W6(귀촌정착) / W9·R6·R7(체험텃밭) / L4(SOC체크). 결정론적(동일 입력→동일 출력).

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

> `fetch_kosis.py`를 재실행해도 `manual` 층은 보존됨 (스크립트가 source='kosis:*' raw 만 덮어씀).  
> 키 이름은 [`docs/DATA-SOURCES.md`](../docs/DATA-SOURCES.md)의 매핑 표 참고.

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

## 3. SGIS API → fetch_sgis.py

### 3-1. 사전 준비

1. [SGIS Open API](https://sgis.kostat.go.kr/developer/) 회원가입 후 ServiceID + SecretKey 발급
2. 환경변수 설정:

```powershell
$env:SGIS_SERVICE_ID = "발급받은_서비스ID"
$env:SGIS_SECRET_KEY = "발급받은_보안Key"
python fetch_sgis.py
```

**출력**: `Web/dat/region-meta.json` (KOSIS source는 보존, SGIS source raw 추가/갱신)

### 3-2. 인증 흐름

```
GET https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json
    ?consumer_key=<ServiceID>&consumer_secret=<SecretKey>
→ { result: { accessToken: "...", accessTimeout: "..." }, errCd: 0 }
```

- AccessToken **유효기간 4시간**
- 스크립트 실행 시작 시 1회 발급, 메모리만 보관 (디스크 캐싱 없음)
- 4시간 내 모든 통계 API 호출에 `accessToken=...` 파라미터로 사용

### 3-3. 활성 endpoint 목록

| key | endpoint | 데이터 |
|-----|----------|--------|
| `main_stats` | `stats/population.json` | 총조사 주요지표 (인구·노령화·평균나이·사업체수 등) |
| `company_all` | `stats/company.json` | 사업체 통계 (전산업) |
| `company_wholesale` | `stats/company.json` + `class_code=G` | 도매 및 소매업 |
| `company_hospitality` | `stats/company.json` + `class_code=I` | 숙박 및 음식점업 |
| `farm` | `stats/farmhousehold.json` | 농가 통계 |
| `house` | `stats/house.json` | 주택 통계 |
| `forestry` | `stats/forestryhousehold.json` | 임가 통계 |
| `fishery` | `stats/fisheryhousehold.json` | 어가 통계 |
| `household_member` | `stats/householdmember.json` | 가구원 통계 |

**호출 패턴 (효율적)**: `adm_cd='41'&low_search='1'` → 경기도 시군구 한 번에 모두 받음 (9 endpoint × 1회 호출).

### 3-4. 응답 구조

```jsonc
{
  "id":     "API_XXXX",
  "result": [
    { "adm_cd": "41360", "adm_nm": "남양주시", "tot_ppltn": 728126, "aging_idx": 31.5, ... }
  ],
  "errCd":  0,
  "errMsg": "Success"
}
```

각 행을 `parse_sgis_rows()`가 시군 코드 매핑 + 필드별 wrapping해서 `raw` 층에 추가.

### 3-5. 새 endpoint 추가 방법

```python
SGIS_TABLES = {
    'health_facility': {                              # 새 endpoint 예시
        'endpoint': 'health.json',                    # SGIS 문서에서 확인
        'desc':     '의료기관 통계',
        'fields':   ['hospital_cnt', 'clinic_cnt'],   # 응답 필드명
        # 'extra':   {'class_code': '...'},           # 옵션
        # 'field_prefix': 'med_',                     # 필드명 prefix (다른 endpoint와 충돌 방지)
    },
}
```

공통 `parse_sgis_rows()` 가 자동 처리 → 별도 parser 함수 작성 불필요.

### 3-6. 에러 코드

| 코드 | 의미 | 조치 |
|------|------|------|
| -100 | 검색결과가 존재하지 않습니다 | year 변경, adm_cd 확인, 또는 권한 활성화 대기 |
| -200 | 행정동/년도 정보 확인 | 파라미터 검토 |
| 412 (HTTP) | Precondition Failed | 필수 파라미터 누락 — endpoint 문서 재확인 |

### 3-7. ⚠️ SGIS 코드 체계 — KOSIS 내부 코드 사용

SGIS API는 **행안부 표준 행정구역코드와 다른 KOSIS 내부 분류코드**를 사용:

| 구분 | 행안부 표준 | KOSIS 내부 (SGIS도 이것 사용) |
|------|------------|------------------------------|
| 경기도 | 41 | **31** |
| 남양주시 | 41360 | 31130 |
| 평택시 | 41220 | 31070 |
| ... | ... | ... |

매핑은 `lib_meta.py` 의 `SGIS_SIGUN_CODES` (city_id → SGIS 코드 리스트) 와 `SGIS_CODE_TO_CITY` (역매핑) 로 처리. `SGIS_PROV_CODE='31'` 도 정의.

**용인시 분구 처리**:
- 용인시는 처인구(31191) / 기흥구(31192) / 수지구(31193) 3개 분구로 나뉨
- `parse_sgis_rows()` 가 카운트류는 합산, 비율/평균류는 평균으로 집계
- `AVG_FIELDS` 집합에 평균 처리할 필드 명시 (`avg_age`, `ppltn_dnsty`, `aged_child_idx`, `avg_family_member_cnt`)

### 3-8. 인증 루프 — `SgisClient` 클래스

`fetch_sgis.py` 의 `SgisClient` 클래스가 토큰 자동 갱신 처리:

```python
class SgisClient:
    MAX_REFRESH = 10                    # 안전장치
    
    def authenticate(self):
        # AccessToken 발급/재발급, refresh_count 증가
        # MAX_REFRESH 초과 시 RuntimeError
    
    def call(self, cfg, year, adm_cd, low_search, _retry=False):
        # 응답에서 errCd == -401 (토큰 만료) 감지하면:
        #   1. authenticate() 재호출 (새 토큰)
        #   2. 동일 요청 1회 재시도 (_retry=True 플래그)
```

스크립트 실행은 보통 1분 이내이므로 4시간 토큰은 충분하지만, 장시간 실행이나 토큰 강제 만료 상황에서도 robust.

---

## 4. region-meta.json 3-layer 협업

두 fetch 스크립트가 같은 파일을 갱신하지만 **충돌 없음**:

| 시나리오 | 동작 |
|---------|------|
| `python fetch_kosis.py` 만 실행 | `source='kosis:*'` raw 만 덮어씀. SGIS raw + manual 보존 |
| `python fetch_sgis.py` 만 실행 | `source='sgis:*'` raw 만 덮어씀. KOSIS raw + manual 보존 |
| 두 스크립트 순차 실행 | 각자 자기 source 갱신, 모두 보존 |
| 사용자가 `manual` 층 편집 | 다음 fetch 재실행 시에도 보존 |

핵심 함수 (`scripts/lib_meta.py`):
- `merge_raw_by_source(existing, new_raw, source_prefix)` — source prefix로 분리해 병합
- `compute_indicators(raw)` — raw 전체로부터 산식 재계산
- `recompute_all(data)` — 모든 시군의 computed 재계산

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
