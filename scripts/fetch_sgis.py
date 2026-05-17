#!/usr/bin/env python3
"""
SGIS Open API (통계지리정보서비스) — 경기도 15개 시군 통계 수집 → region-meta.json 갱신.

KOSIS Open API의 시군구 단위 한계를 보완:
  - 총조사 주요지표 (인구·노령화지수·평균나이·인구밀도·총가구·총주택·사업체수)
  - 사업체통계 (전산업 + 산업분류별 G/I — 도소매·숙박음식)
  - 농가·임가·어가 통계
  - 가구원·주택 통계

공통 로직(스키마·산식·로드/저장)은 `lib_meta.py`에서 가져옴.
fetch_kosis.py 와 협업: 자기 source ('sgis:*') raw 만 덮어쓰고
KOSIS raw 와 manual 층은 보존.

== 인증 ==
  AccessToken 4시간 유효 — 스크립트 실행 시작 시 1회 발급, 메모리만 보관

== 호출 패턴 ==
  adm_cd='41' + low_search='1' → 경기도 시군구 한 번에 모두 (15시군 = 1회 호출)

실행:
  $env:SGIS_SERVICE_ID = "발급받은_서비스ID"
  $env:SGIS_SECRET_KEY = "발급받은_보안Key"
  python fetch_sgis.py
"""

import os, sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from lib_meta import (
    SIGUN_CODES, CODE_TO_CITY,
    to_number,
    load_full_meta, save_meta, recompute_all, merge_raw_by_source,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass

try:
    import requests
except ImportError:
    print('[ERROR] requests 미설치. `pip install requests`', file=sys.stderr)
    sys.exit(1)


# ─── 상수 ─────────────────────────────────────────────────────────────────

SGIS_SERVICE_ID = os.environ.get('SGIS_SERVICE_ID', '').strip()
SGIS_SECRET_KEY = os.environ.get('SGIS_SECRET_KEY', '').strip()

# SGIS API 베이스 — 두 도메인 모두 동일 (mods.go.kr 신규, kostat.go.kr 구버전)
AUTH_URL = 'https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json'
BASE_URL = 'https://sgisapi.kostat.go.kr/OpenAPI3/stats'

# 기본 조회 연도 — SGIS 데이터는 보통 2년 전이 최신
DEFAULT_YEAR = int(os.environ.get('SGIS_YEAR', '2023'))


# ─── 통계표 설정 ─────────────────────────────────────────────────────────
#  새 endpoint 추가 시:
#   1) SGIS_TABLES 에 1항목 추가 (endpoint, desc, fields, [field_prefix, extra])
#   2) 파싱은 공통 parse_sgis_rows() 가 처리

SGIS_TABLES = {
    'main_stats': {
        'endpoint': 'population.json',
        'desc':     '총조사 주요지표 (인구·노령화·사업체)',
        'fields':   ['tot_ppltn', 'avg_age', 'ppltn_dnsty', 'aging_idx',
                     'tot_house', 'corp_cnt', 'nongga_cnt'],
    },
    'company_all': {
        'endpoint': 'company.json',
        'desc':     '사업체 통계 (전산업)',
        'fields':   ['corp_cnt', 'tot_worker'],
        'field_prefix': 'all_',
    },
    'company_wholesale': {
        'endpoint': 'company.json',
        'extra':    {'class_code': 'G'},
        'desc':     '도매 및 소매업 사업체 (W8 입력)',
        'fields':   ['corp_cnt', 'tot_worker'],
        'field_prefix': 'wholesale_',
    },
    'company_hospitality': {
        'endpoint': 'company.json',
        'extra':    {'class_code': 'I'},
        'desc':     '숙박 및 음식점업 사업체 (W8 입력)',
        'fields':   ['corp_cnt', 'tot_worker'],
        'field_prefix': 'hospitality_',
    },
    'farm': {
        'endpoint': 'farmhousehold.json',
        'desc':     '농가 통계 (W5 입력)',
        'fields':   ['farm_cnt', 'farm_population'],
    },
    'house': {
        'endpoint': 'house.json',
        'desc':     '주택 통계',
        'fields':   ['house_cnt'],
    },
    'forestry': {
        'endpoint': 'forestryhousehold.json',
        'desc':     '임가 통계',
        'fields':   ['forestry_cnt', 'forestry_population'],
    },
    'fishery': {
        'endpoint': 'fisheryhousehold.json',
        'desc':     '어가 통계',
        'fields':   ['fishery_cnt', 'fishery_population'],
    },
    'household_member': {
        'endpoint': 'householdmember.json',
        'desc':     '가구원 통계',
        'fields':   ['avg_family_member_cnt', 'tot_family'],
    },
}


# ─── 인증 ────────────────────────────────────────────────────────────────

def authenticate() -> str:
    """SGIS AccessToken 발급 (4시간 유효, 메모리만 보관)."""
    if not SGIS_SERVICE_ID or not SGIS_SECRET_KEY:
        raise RuntimeError(
            'SGIS_SERVICE_ID / SGIS_SECRET_KEY 환경변수 미설정.\n'
            '  $env:SGIS_SERVICE_ID = "..."; $env:SGIS_SECRET_KEY = "..."'
        )
    params = {
        'consumer_key':    SGIS_SERVICE_ID,
        'consumer_secret': SGIS_SECRET_KEY,
    }
    print('  [auth] AccessToken 발급 중…', end=' ', flush=True)
    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        r = requests.get(AUTH_URL, params=params, timeout=20, verify=False)
        body = r.json()
        if body.get('errCd') not in (0, None) and body.get('errCd') != '0':
            raise RuntimeError(f"인증 실패 (errCd={body.get('errCd')}, errMsg={body.get('errMsg')})")
        token = body.get('result', {}).get('accessToken')
        if not token:
            raise RuntimeError(f'토큰 미발급. 응답: {body}')
        print(f"성공")
        return token
    except Exception as e:
        print(f"실패")
        raise


# ─── SGIS API 호출 ───────────────────────────────────────────────────────

def fetch_sgis_table(token: str, cfg: dict, year: int, adm_cd: str = '41',
                     low_search: str = '1') -> list:
    """SGIS 통계 호출. 실패 시 None."""
    endpoint = cfg['endpoint']
    params = {
        'accessToken': token,
        'year':        str(year),
        'adm_cd':      adm_cd,
        'low_search':  low_search,
        **cfg.get('extra', {}),
    }
    url = f"{BASE_URL}/{endpoint}"
    extra_str = ' '.join(f'{k}={v}' for k, v in cfg.get('extra', {}).items())
    print(f"  [{endpoint:30s}] {cfg['desc']:40s} {extra_str:15s}", end=' ', flush=True)
    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        r = requests.get(url, params=params, timeout=30, verify=False)
        r.raise_for_status()
        body = r.json()
        err_cd = body.get('errCd')
        if err_cd not in (0, '0', None):
            print(f"실패 (errCd={err_cd}, errMsg={body.get('errMsg', '?')[:50]})")
            return None
        rows = body.get('result', [])
        if not rows:
            print(f"빈 응답")
            return None
        print(f"성공 ({len(rows)}행)")
        return rows
    except Exception as e:
        print(f"실패 ({type(e).__name__}: {e})")
        return None


# ─── 공통 파서 (SGIS 응답 구조가 일관) ───────────────────────────────────

def parse_sgis_rows(rows: list, cfg: dict, source_id: str, year: int) -> dict:
    """
    SGIS 응답 행 → {city_id: {field: {value, year, source}}}
    """
    prefix = cfg.get('field_prefix', '')
    fields = cfg.get('fields', [])
    source = f"sgis:{source_id}"
    year_str = str(year)
    out = {}
    for r in rows:
        adm_cd = str(r.get('adm_cd', '')).strip()
        # 시군구 코드는 5자리. SGIS는 정확히 5자리 반환.
        if len(adm_cd) < 5: continue
        code5 = adm_cd[:5]
        if code5 not in CODE_TO_CITY: continue
        cid = CODE_TO_CITY[code5]
        if cid not in out: out[cid] = {}
        for f in fields:
            v = r.get(f)
            num = to_number(v)
            if num is None: continue
            key = f'{prefix}{f}'
            out[cid][key] = {
                'value':  num,
                'year':   year_str,
                'source': source,
            }
    return out


# ─── 메인 ─────────────────────────────────────────────────────────────────

def fetch_all(existing_data: dict, year: int) -> dict:
    if not SGIS_SERVICE_ID or not SGIS_SECRET_KEY:
        print('[WARN] SGIS 자격증명 미설정 — SGIS 갱신 건너뜀')
        return existing_data

    print(f'=== SGIS Open API 수집 시작 (year={year}) ===\n')

    try:
        token = authenticate()
    except Exception as e:
        print(f'\n[ERROR] 인증 실패 — SGIS 데이터 수집 중단: {e}')
        return existing_data
    print()

    new_raw_by_city = {}   # 시군별 raw 통합 (모두 source='sgis:*')
    tables_status = {}

    for key, cfg in SGIS_TABLES.items():
        rows = fetch_sgis_table(token, cfg, year=year, adm_cd='41', low_search='1')
        # source_id: endpoint (확장자 제외) + extra 일부 + key 식별
        endpoint = cfg['endpoint'].replace('.json', '')
        source_id = key
        if rows:
            parsed = parse_sgis_rows(rows, cfg, source_id=source_id, year=year)
            for cid, fields in parsed.items():
                new_raw_by_city.setdefault(cid, {}).update(fields)
            tables_status[key] = {
                'endpoint': endpoint,
                'year':     year,
                'count':    len(parsed),
                'status':   'ok',
            }
        else:
            tables_status[key] = {
                'endpoint': endpoint,
                'year':     year,
                'status':   'failed',
            }

    # source-aware 병합 — SGIS raw 만 덮어씀
    merge_raw_by_source(existing_data, new_raw_by_city, 'sgis')

    # _meta.tables 의 SGIS 항목 갱신 (KOSIS와 prefix 구분)
    existing_data['_meta'].setdefault('tables', {})
    for k, v in tables_status.items():
        existing_data['_meta']['tables'][f'sgis_{k}'] = v
    existing_data['_meta']['fetched_at'] = datetime.now().isoformat()
    existing_data['_meta']['source'] = 'kosis_api + sgis_api + manual'

    # ── 커버리지 리포트 ──
    print('\n=== SGIS Coverage 리포트 ===')
    for key, s in tables_status.items():
        cfg = SGIS_TABLES.get(key, {})
        if s.get('status') == 'ok':
            print(f"  ✅ [{key:22s}] {s.get('count', 0):2d}개 시군 | {cfg.get('desc','')}")
        else:
            print(f"  ❌ [{key:22s}] 실패 | {cfg.get('desc','')}")
    n_sgis = sum(1 for cid in SIGUN_CODES
                 for v in existing_data['sigun'].get(cid, {}).get('raw', {}).values()
                 if isinstance(v, dict) and str(v.get('source','')).startswith('sgis:'))
    print(f"  📊 SGIS raw 필드 총 {n_sgis}개 (15시군 × 평균 {n_sgis//15 if n_sgis else 0}개 필드)\n")
    return existing_data


def main():
    data = load_full_meta()
    data = fetch_all(data, year=DEFAULT_YEAR)
    recompute_all(data)
    data['_meta']['coverage'] = {
        'sigun': sum(1 for d in data['sigun'].values() if d.get('raw')),
        'dong':  len(data.get('dong', {})),
    }
    save_meta(data)


if __name__ == '__main__':
    main()
