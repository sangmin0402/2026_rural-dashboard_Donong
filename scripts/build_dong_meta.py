#!/usr/bin/env python3
"""
gyeonggi-dong.geojson 경계 기반 읍면 메타를 region-meta.json 에 병합.

SGIS/KOSIS API 자격증명이 없을 때도 UI가 시군 통계와 읍면 통계를 구분할 수
있도록, 실제 경계 파일에서 읍면명·소속 시군·면적·대표좌표를 채운다.

실행:
  python build_dong_meta.py
"""

import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from lib_meta import (
    DONG_GEOJSON_PATH,
    load_full_meta,
    save_meta,
    merge_dong_raw_by_source,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass

try:
    import geopandas as gpd
except ImportError:
    print('[ERROR] geopandas 미설치. `pip install -r requirements.txt`', file=sys.stderr)
    sys.exit(1)


def build_boundary_raw() -> dict:
    if not DONG_GEOJSON_PATH.exists():
        raise FileNotFoundError(f'읍면 경계 파일 없음: {DONG_GEOJSON_PATH}')

    print(f'[1/3] 읍면 GeoJSON 로드: {DONG_GEOJSON_PATH}')
    gdf = gpd.read_file(DONG_GEOJSON_PATH)
    if gdf.crs is None:
        gdf = gdf.set_crs('EPSG:4326')
    gdf_metric = gdf.to_crs('EPSG:5186')
    centers = gdf_metric.geometry.centroid.to_crs('EPSG:4326')

    print(f'[2/3] {len(gdf):,}개 읍면 면적·대표좌표 계산')
    out = {}
    source = 'boundary:gyeonggi-dong.geojson'
    year = '2026'
    for idx, row in gdf.iterrows():
        adm_cd = str(row.get('adm_cd', '')).strip()
        if not adm_cd:
            continue
        center = centers.iloc[idx]
        area_km2 = round(float(gdf_metric.geometry.iloc[idx].area) / 1_000_000, 2)
        out[adm_cd] = {
            'adm_nm': {
                'value': str(row.get('adm_nm', '')).strip(),
                'year': year,
                'source': source,
            },
            'city_id': {
                'value': str(row.get('city_id', '')).strip(),
                'year': year,
                'source': source,
            },
            'area': {
                'value': area_km2,
                'year': year,
                'source': source,
            },
            'center_lat': {
                'value': round(float(center.y), 5),
                'year': year,
                'source': source,
            },
            'center_lng': {
                'value': round(float(center.x), 5),
                'year': year,
                'source': source,
            },
        }
    return out


def main():
    data = load_full_meta()
    raw = build_boundary_raw()
    print('[3/3] region-meta.json dong raw 병합')
    merge_dong_raw_by_source(data, raw, 'boundary')
    data.setdefault('_meta', {}).setdefault('tables', {})['dong_boundary'] = {
        'source': 'gyeonggi-dong.geojson',
        'count': len(raw),
        'status': 'ok',
    }
    data['_meta']['fetched_at'] = datetime.now().isoformat()
    data['_meta']['coverage'] = {
        'sigun': sum(1 for d in data.get('sigun', {}).values() if d.get('raw')),
        'dong': len(data.get('dong', {})),
    }
    save_meta(data)


if __name__ == '__main__':
    main()
