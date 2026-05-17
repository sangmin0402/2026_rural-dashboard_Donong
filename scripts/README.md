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

### 2-2. 현재 수집 테이블 (활성)

| 키 | 테이블명 | orgId | tblId | 파라미터 | 수집 항목 |
|----|---------|-------|-------|---------|---------|
| `sigun_pop` | 행정구역(시군구)별 성별 인구수 | 101 | DT_1B040A3 | `objL1=ALL&itmId=ALL&prdSe=M&newEstPrdCnt=1` | 총인구수 (T20) |
| `sigun_hh` | 행정구역(시군구)별 주민등록세대수 | 101 | DT_1B040B3 | `objL1=ALL&itmId=ALL&prdSe=M&newEstPrdCnt=1` | 세대수 (T1) |

두 테이블 모두 **15/15 경기도 시군 완전 수집** 확인 (2026-05 기준).

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

### 2-3. 미수집 테이블 (비활성 — 파라미터 미확인)

아래 테이블들은 `fetch_kosis.py` 내 `TABLES` dict에 주석으로 남겨둠.  
파라미터 확인 후 주석 해제 + 대응 `parse_*` 함수 주석 해제하면 즉시 활성화 가능.

| 키 | tblId | 수집 목표 | 현재 장애 |
|----|-------|---------|---------|
| `sigun_age` | DT_1IN1502 | 고령화율·청년비율 | `objL1=ALL&itmId=ALL` → ERR 31 (40,000셀 초과). 특정 연령 ITM_ID 불명 |
| `sigun_biz` | DT_1K51003 | 사업체수·종사자수 | `objL1=ALL&objL2=ALL&itmId=ALL` → ERR 31. 경기도 필터 코드 불명 |
| `dong_pop` | DT_1B040M1 | 읍면동별 인구·세대수 | 3차원 필요, 경기도 필터 적용 시 ERR 21 (코드 체계 불명) |

**재시도 힌트**:
- ERR 31 (40,000셀 초과): `objL1` 또는 `objL2`에 경기도 코드를 지정해 데이터량 감소 필요. KOSIS 내부 차원 코드는 표준 행정구역코드(41, 41220 등)가 아닐 수 있음 — KOSIS 웹에서 해당 표 URL의 `objL1`, `objL2` 파라미터 값을 확인할 것.
- DT_1IN1502의 경우: `itmId=ALL`이 40,000셀 초과를 유발. KOSIS 웹에서 65세이상 항목의 ITM_ID 값을 확인 후 `itmId=해당코드`로 지정하면 해결 가능.
- DT_1B040M1의 경우: `objL1=ALL&objL2=ALL&objL3=ALL&itmId=ALL` 조합은 성공하나 40,000셀 초과. 시도별 분할 요청이 필요하나 경기도 코드 형식 미확인.

---

### 2-4. 새 테이블 추가 방법

`fetch_kosis.py`는 **1 테이블 = TABLES dict 1항목 + parse_* 함수 1개** 구조로 설계됨.

```python
# 1. TABLES dict에 항목 추가
TABLES = {
    ...
    'sigun_agri': {
        'orgId': '101', 'tblId': 'DT_농업테이블ID',
        'prdSe': 'Y',   'newEstPrdCnt': '1',
        'extra': {'itmId': 'ALL'},
        'desc':  '시군구별 농가수 및 경지면적',
    },
}

# 2. 파서 함수 추가
def parse_sigun_agri(rows):
    # ... ITM_ID 파악 후 city_id → {farms, area} 매핑
    return result

# 3. fetch_all() 내 PARSERS dict에 추가
PARSERS = {
    ...
    'sigun_agri': parse_sigun_agri,
}

# 4. merge_all() 내 병합 로직 추가
if 'sigun_agri' in parsed:
    for cid, vals in parsed['sigun_agri'].items():
        sigun[cid].update(...)
```

---

### 2-5. KOSIS API 공통 파라미터

| 파라미터 | 값 | 설명 |
|---------|---|------|
| `method` | `getList` | 데이터 조회 |
| `format` | `json` | 응답 형식 |
| `jsonVD` | `Y` | JSON 값 직접 반환 |
| `prdSe` | `M` (월) / `Y` (연) | 수록 주기 |
| `newEstPrdCnt` | `1` | 최신 1개 기간 |
| `objL1` | `ALL` | 1차 분류 전체 |
| `itmId` | `ALL` | 항목 전체 |

**SSL 주의**: KOSIS 서버는 self-signed 인증서를 사용함 → `verify=False` 필요 (스크립트에 이미 적용됨, `InsecureRequestWarning` 자동 suppressed).

**에러 코드**:
| 코드 | 의미 | 조치 |
|------|------|------|
| 20 | 필수 파라미터 누락 | `objL1/objL2` 또는 `itmId` 추가 |
| 21 | 잘못된 요청 변수 | tblId/orgId 또는 objL 값 재확인 |
| 31 | 40,000셀 초과 | 특정 objL 값으로 필터링 필요 |

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
