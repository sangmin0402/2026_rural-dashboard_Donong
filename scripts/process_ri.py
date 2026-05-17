#!/usr/bin/env python3
"""
경기도 행정리 SHP → GeoJSON 변환 스크립트

입력: LSMD_ADM_SECT_RI_41_*.shp (국토교통부 행정구역_리(법정동) SHP, EPSG:5186, EUC-KR)
출력: gyeonggi-ri.geojson (EPSG:4326, UTF-8, 단순화·시군매핑·우리 15개 시군 필터)

실행:
  python process_ri.py <input.shp> <output.geojson>

예시:
  python process_ri.py "C:/Users/liber/Downloads/LSMD_ADM_SECT_RI_경기/LSMD_ADM_SECT_RI_41_202605.shp" \\
                        "../dat/gyeonggi-ri.geojson"
"""

import sys
import os
import json

# Windows 콘솔 cp949 환경에서 한글/특수문자 출력 가능하게 stdout을 UTF-8로 재구성
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

try:
    import geopandas as gpd
except ImportError:
    print('[ERROR] geopandas 미설치. `pip install -r requirements.txt` 실행하세요.', file=sys.stderr)
    sys.exit(1)

# 표준 행정구역 코드(5자리) → 우리 city_id 매핑
# 12개만 매핑됨. 오산·하남·동두천은 동만 있어 행정리 없음 → SHP에 없음.
SIGUN_CODE_TO_ID = {
    '41220': 'pyeongtaek',  # 평택시
    '41360': 'namyangju',   # 남양주시
    '41460': 'yongin',      # 용인시
    '41500': 'icheon',      # 이천시
    '41550': 'anseong',     # 안성시
    '41590': 'hwaseong',    # 화성시
    '41610': 'gwangju',     # 광주시
    '41630': 'yangju',      # 양주시
    '41650': 'pocheon',     # 포천시
    '41670': 'yeoju',       # 여주시
    '41820': 'gapyeong',    # 가평군
    '41830': 'yangpyeong',  # 양평군
}


def process(input_shp, output_geojson, simplify_tolerance=0.0003, coord_precision=5):
    print(f'[1/6] SHP 로드: {input_shp}')
    gdf = gpd.read_file(input_shp, encoding='cp949')
    print(f'      총 {len(gdf):,}개 feature 로드')
    print(f'      컬럼: {list(gdf.columns)}')
    print(f'      원본 CRS: {gdf.crs}')

    print('[2/6] 좌표계 변환 EPSG:5186 → EPSG:4326 (WGS84)')
    gdf = gdf.to_crs(epsg=4326)

    print('[3/6] 시군 코드(COL_ADM_SE)로 city_id 매핑')
    gdf['city_id'] = gdf['COL_ADM_SE'].astype(str).map(SIGUN_CODE_TO_ID)
    before = len(gdf)
    gdf = gdf[gdf['city_id'].notna()].copy()
    print(f'      필터링: {before:,} → {len(gdf):,} ({before - len(gdf):,}개 제외, 우리 15개 시군 외)')

    # 시군별 카운트
    print('      시군별 행정리 수:')
    for cid in sorted(gdf['city_id'].unique()):
        cnt = (gdf['city_id'] == cid).sum()
        print(f'        - {cid}: {cnt}개')

    print(f'[4/6] 좌표 단순화 (tolerance={simplify_tolerance}, ~10m)')
    gdf['geometry'] = gdf['geometry'].simplify(tolerance=simplify_tolerance, preserve_topology=True)

    print('[5/6] 속성 정리 (city_id, ri_cd, ri_nm, dong_cd 만 유지)')
    # RI_CD 10자리 → 앞 8자리 = 법정동 코드 (소속 읍면동의 행안부 코드)
    gdf['ri_cd'] = gdf['RI_CD'].astype(str)
    gdf['ri_nm'] = gdf['RI_NM']
    gdf['dong_cd'] = gdf['ri_cd'].str[:8]  # 행정리 코드에서 상위 읍면 코드 추출

    # 이상한 RI_NM (숫자 코드만 있는 항목) 정리 — 연천군 등 미매핑 외 데이터
    gdf = gdf[gdf['ri_nm'].astype(str).str.match(r'^[가-힣]+(\s?\d+동)?$', na=False)].copy()
    print(f'      한글 이름 정상 행정리: {len(gdf):,}개')

    gdf = gdf[['city_id', 'ri_cd', 'ri_nm', 'dong_cd', 'geometry']]

    print(f'[6/6] GeoJSON 저장 (좌표 소수점 {coord_precision}자리로 반올림): {output_geojson}')
    os.makedirs(os.path.dirname(output_geojson), exist_ok=True)
    if os.path.exists(output_geojson):
        os.remove(output_geojson)

    # 좌표 정밀도 줄이기 — JSON 텍스트 크기 대폭 감소
    # 0.00001도 ≈ 1m, 5자리면 충분
    def _round_coords(coords, n):
        if isinstance(coords[0], (list, tuple)):
            return [_round_coords(c, n) for c in coords]
        return [round(coords[0], n), round(coords[1], n)]

    geojson_obj = json.loads(gdf.to_json())
    for feat in geojson_obj['features']:
        if feat['geometry']:
            feat['geometry']['coordinates'] = _round_coords(
                feat['geometry']['coordinates'], coord_precision
            )
    with open(output_geojson, 'w', encoding='utf-8') as f:
        # separators로 공백 제거 — 추가 압축
        json.dump(geojson_obj, f, ensure_ascii=False, separators=(',', ':'))

    size_mb = os.path.getsize(output_geojson) / 1024 / 1024
    print(f'      파일 크기: {size_mb:.2f} MB')

    print('\n[완료] 다음 단계:')
    print('  python -c "import json; d=json.load(open(\'%s\', encoding=\'utf-8\')); print(\'features:\', len(d[\\"features\\"])); print(\'sample:\', d[\\"features\\"][0][\\"properties\\"])"' % output_geojson)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    process(sys.argv[1], sys.argv[2])
