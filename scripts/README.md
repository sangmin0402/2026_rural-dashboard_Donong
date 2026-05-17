# 데이터 가공 스크립트

행정리(법정리) 경계 SHP을 가공하여 GeoJSON으로 변환하고, KOSIS 통계 API에서 시군·읍면 메타정보를 받아오는 스크립트들.

## 의존성

```bash
cd Web/scripts
python -m venv venv

# Windows (PowerShell)
venv\Scripts\Activate.ps1

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

`geopandas`는 내부적으로 GDAL이 필요합니다. Windows에선 보통 `pip install`로 함께 설치되지만, 문제가 있다면 [OSGeo4W](https://trac.osgeo.org/osgeo4w/) 또는 `conda install -c conda-forge geopandas`를 권장합니다.

## 1. 행정리 SHP → GeoJSON

```bash
python process_ri.py "C:/Users/liber/Downloads/LSMD_ADM_SECT_RI_경기/LSMD_ADM_SECT_RI_41_202605.shp" "../dat/gyeonggi-ri.geojson"
```

**입력**: 국토교통부 `행정구역_리(법정동)` SHP (V-WORLD 다운로드)
- 좌표계: EPSG:5186 (Korea 2000 / Central Belt 2010)
- 인코딩: EUC-KR (cp949)

**출력**: `Web/dat/gyeonggi-ri.geojson`
- 좌표계: EPSG:4326 (WGS84, Leaflet 표준)
- 인코딩: UTF-8
- 단순화: tolerance 0.0001 (≈ 10m)
- 우리 15개 시군 중 행정리 보유 12개만 매핑·필터링 (오산·하남·동두천 제외 — 동만 있음)
- 속성: `city_id`, `ri_cd`(10자리), `ri_nm`(리 이름), `dong_cd`(상위 읍면 코드 8자리)

## 2. KOSIS API → 메타정보 JSON

```bash
# 1. KOSIS API 키 발급: https://kosis.kr/openapi/ (회원가입 후 신청)
# 2. 환경변수 설정 후 실행

# Windows PowerShell
$env:KOSIS_API_KEY = "발급받은_키"; python fetch_kosis.py

# macOS/Linux
KOSIS_API_KEY="발급받은_키" python fetch_kosis.py
```

**출력**: `Web/dat/region-meta.json`

키 없이 실행하면 placeholder JSON 생성 → 사이트는 정상 동작하되 "예시 데이터" 배지 표기.

**현재 상태**: 실제 KOSIS 호출 코드는 미구현. 사용자가 원하는 통계표(주민등록인구, 사업체수 등)에 맞춰 `fetch_kosis.py` 안의 TODO 부분을 채워주세요. 호출 패턴은 함수 docstring 참고.

## 시군 코드 매핑표

| 행안부 코드 | 시군 | city_id | 우리거 |
|---|---|---|---|
| 41220 | 평택시 | pyeongtaek | ✓ |
| 41250 | 동두천시 | dongducheon | ✓ (동만 있음 - 행정리 없음) |
| 41360 | 남양주시 | namyangju | ✓ |
| 41370 | 오산시 | osan | ✓ (동만 있음) |
| 41450 | 하남시 | hanam | ✓ (동만 있음) |
| 41460 | 용인시 | yongin | ✓ |
| 41500 | 이천시 | icheon | ✓ |
| 41550 | 안성시 | anseong | ✓ |
| 41590 | 화성시 | hwaseong | ✓ |
| 41610 | 광주시 | gwangju | ✓ |
| 41630 | 양주시 | yangju | ✓ |
| 41650 | 포천시 | pocheon | ✓ |
| 41670 | 여주시 | yeoju | ✓ |
| 41820 | 가평군 | gapyeong | ✓ |
| 41830 | 양평군 | yangpyeong | ✓ |
