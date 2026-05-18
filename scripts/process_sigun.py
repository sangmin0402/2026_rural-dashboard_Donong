#!/usr/bin/env python3
"""
경기도 시군 SHP → GeoJSON 변환 스크립트

입력: BND_SIGUNGU_PG.shp (통계청 SGIS 시군구 경계, EPSG:5186, CP949,
      SGIS 내부 코드 사용 — 경기도=31xxx)
출력: ../dat/gyeonggi-sigun.geojson (EPSG:4326, UTF-8, 단순화,
      우리 15개 시군만 + 용인시 분구 통합)

실행:
  python process_sigun.py <input.shp> [output.geojson]
  python process_sigun.py "C:/Users/liber/Downloads/BND_SIGUNGU_PG/BND_SIGUNGU_PG.shp"
"""

import sys
import os
import json
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass

try:
    import geopandas as gpd
except ImportError:
    print('[ERROR] geopandas 미설치. `pip install -r requirements.txt`', file=sys.stderr)
    sys.exit(1)


# SGIS 내부 시군구 코드 → 우리 city_id 매핑
# (용인시는 분구 3개를 한 city_id 로 묶음 — dissolve 처리)
SGIS_CODE_TO_ID = {
    '31070': 'pyeongtaek',
    '31080': 'dongducheon',
    '31130': 'namyangju',
    '31140': 'osan',
    '31180': 'hanam',
    '31191': 'yongin',      # 용인시 처인구
    '31192': 'yongin',      # 용인시 기흥구
    '31193': 'yongin',      # 용인시 수지구
    '31210': 'icheon',
    '31220': 'anseong',
    '31240': 'hwaseong',
    '31250': 'gwangju',
    '31260': 'yangju',
    '31270': 'pocheon',
    '31280': 'yeoju',
    '31570': 'gapyeong',
    '31580': 'yangpyeong',
}

# city_id → 정식 한글 이름 + 시군 유형
CITY_META = {
    'pyeongtaek':  ('평택시',   '시'),
    'dongducheon': ('동두천시', '시'),
    'namyangju':   ('남양주시', '시'),
    'osan':        ('오산시',   '시'),
    'hanam':       ('하남시',   '시'),
    'yongin':      ('용인시',   '시'),
    'icheon':      ('이천시',   '시'),
    'anseong':     ('안성시',   '시'),
    'hwaseong':    ('화성시',   '시'),
    'gwangju':     ('광주시',   '시'),
    'yangju':      ('양주시',   '시'),
    'pocheon':     ('포천시',   '시'),
    'yeoju':       ('여주시',   '시'),
    'gapyeong':    ('가평군',   '군'),
    'yangpyeong':  ('양평군',   '군'),
}


def process(input_shp, output_geojson,
            simplify_tolerance=0.0008, coord_precision=5):
    print(f'[1/6] SHP 로드: {input_shp}')
    gdf = gpd.read_file(input_shp, encoding='cp949')
    print(f'      총 {len(gdf):,}개 feature 로드 ({gdf.crs})')
    print(f'      컬럼: {list(gdf.columns)}')

    print('[2/6] 좌표계 변환 EPSG:5186 → EPSG:4326 (WGS84)')
    gdf = gdf.to_crs(epsg=4326)

    print('[3/6] 우리 15시군 필터 + city_id 매핑')
    gdf['city_id'] = gdf['SIGUNGU_CD'].astype(str).map(SGIS_CODE_TO_ID)
    before = len(gdf)
    gdf = gdf[gdf['city_id'].notna()].copy()
    print(f'      필터링: {before:,} → {len(gdf):,}')

    print('[4/6] 용인시 분구 dissolve (3개 → 1개)')
    # dissolve: 같은 city_id 인 행들의 geometry 를 union
    gdf = gdf.dissolve(by='city_id', as_index=False)
    print(f'      dissolve 후: {len(gdf)}개 시군')
    if len(gdf) != 15:
        print(f'      ⚠️ 경고: 15개 시군 기대, 실제 {len(gdf)}개')

    print('[5/6] 속성 정리 + 좌표 단순화')
    # name, type 부여
    gdf['name'] = gdf['city_id'].map(lambda cid: CITY_META[cid][0])
    gdf['type'] = gdf['city_id'].map(lambda cid: CITY_META[cid][1])
    # 단순화 (시군 단위라 tolerance 조금 크게)
    gdf['geometry'] = gdf['geometry'].simplify(
        tolerance=simplify_tolerance, preserve_topology=True
    )
    # 최종 컬럼만
    gdf = gdf[['city_id', 'name', 'type', 'geometry']].rename(columns={'city_id': 'id'})

    print(f'[6/6] GeoJSON 저장 (소수점 {coord_precision}자리): {output_geojson}')
    os.makedirs(os.path.dirname(output_geojson), exist_ok=True)

    # 좌표 정밀도 축소
    def _round_coords(coords, n):
        if isinstance(coords[0], (list, tuple)):
            return [_round_coords(c, n) for c in coords]
        return [round(coords[0], n), round(coords[1], n)]

    obj = json.loads(gdf.to_json())
    for feat in obj['features']:
        if feat['geometry']:
            feat['geometry']['coordinates'] = _round_coords(
                feat['geometry']['coordinates'], coord_precision
            )
    with open(output_geojson, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(output_geojson) // 1024
    print(f'      크기: {size_kb} KB')

    print('\n[완료] 매핑 시군:')
    for _, r in gdf.iterrows():
        print(f'  {r["id"]:12s} {r["name"]} ({r["type"]})')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    in_shp = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) >= 3 else \
               str(Path(__file__).parent / '..' / 'dat' / 'gyeonggi-sigun.geojson')
    process(in_shp, out_path)
