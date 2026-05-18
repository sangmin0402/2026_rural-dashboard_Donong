#!/usr/bin/env python3
"""
SGIS Open API (통계지리정보서비스) — 경기도 15개 시군 통계 수집 → region-meta.json 갱신.

KOSIS의 시군구 단위 한계를 보완:
  - 총조사 주요지표 (인구·노령화지수·평균나이·인구밀도·총가구·총주택·사업체수)
  - 사업체통계 (전산업 + 산업분류별 G·I — 도소매·숙박음식)
  - 농가·임가·어가 통계
  - 농가 가구원 통계

공통 로직(스키마·산식·로드/저장)은 `lib_meta.py`에서 가져옴.
fetch_kosis.py 와 협업: 자기 source ('sgis:*') raw 만 덮어쓰고
KOSIS raw 와 manual 층은 보존.

== 인증 루프 ==
  AccessToken 4시간 유효 — 스크립트 실행 시작 시 1회 발급.
  errCd=-401(토큰 만료) 응답 시 자동 재발급 + 1회 재시도 (`SgisClient.call`).

== 호출 패턴 ==
  adm_cd=SGIS_PROV_CODE + low_search='1' → 경기도 시군구 한 번에 모두 (15시군 = 1회 호출)

== 연도 정책 ==
  - 인구/주택/가구/사업체: 2024 (최신 통계청 인구주택총조사)
  - 농가/임가/어가/가구원: 2020 (5년 주기 — 다음은 2025)

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
    SGIS_PROV_CODE, SGIS_SIGUN_CODES, SGIS_CODE_TO_CITY,
    to_number,
    load_full_meta, save_meta, recompute_all,
    merge_raw_by_source, merge_dong_raw_by_source,
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

AUTH_URL = 'https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json'
BASE_URL = 'https://sgisapi.kostat.go.kr/OpenAPI3/stats'


# ─── 통계표 설정 ─────────────────────────────────────────────────────────
#  새 endpoint 추가:
#    1) SGIS_TABLES 에 1항목 추가 (endpoint, year, desc, fields)
#    2) (옵션) field_prefix, extra 파라미터 지정
#    3) 파싱은 공통 parse_sgis_rows() 자동 처리

SGIS_TABLES = {
    'main_stats': {
        'endpoint': 'population.json',
        'year':     2024,
        'desc':     '총조사 주요지표 (인구·노령화·사업체)',
        'fields':   ['tot_ppltn', 'avg_age', 'ppltn_dnsty',
                     'aged_child_idx',                # 노령화지수 (✅ 정정: aging_idx 아님)
                     'tot_house', 'corp_cnt', 'tot_family'],
    },
    'company_all': {
        'endpoint': 'company.json',
        'year':     2024,
        'desc':     '사업체 통계 (전산업)',
        'fields':   ['corp_cnt', 'tot_worker'],
        'field_prefix': 'all_',                       # → all_corp_cnt, all_tot_worker
    },
    'company_wholesale': {
        'endpoint': 'company.json',
        'year':     2024,
        'extra':    {'class_code': 'G'},
        'desc':     '도매 및 소매업 (W8 입력)',
        'fields':   ['corp_cnt', 'tot_worker'],
        'field_prefix': 'wholesale_',
    },
    'company_hospitality': {
        'endpoint': 'company.json',
        'year':     2024,
        'extra':    {'class_code': 'I'},
        'desc':     '숙박 및 음식점업 (W8 입력)',
        'fields':   ['corp_cnt', 'tot_worker'],
        'field_prefix': 'hospitality_',
    },
    'farm': {
        'endpoint': 'farmhousehold.json',
        'year':     2020,                              # ✅ 5년 주기 (다음 2025)
        'desc':     '농가 통계 (W5 입력)',
        'fields':   ['farm_cnt', 'farm_population'],
    },
    'house': {
        'endpoint': 'house.json',
        'year':     2024,
        'desc':     '주택 통계',
        'fields':   ['house_cnt'],
    },
    'forestry': {
        'endpoint': 'forestryhousehold.json',
        'year':     2020,                              # ✅ 5년 주기
        'desc':     '임가 통계',
        'fields':   ['forestry_cnt', 'forestry_population'],
    },
    'fishery': {
        'endpoint': 'fisheryhousehold.json',
        'year':     2020,                              # ✅ 5년 주기
        'extra':    {'oga_div': '0'},                  # ✅ 필수: 0=전체 / 1=내수면 / 2=해수면
        'desc':     '어가 통계',
        'fields':   ['fishery_cnt', 'fishery_population'],
    },
    'household_member_farm': {
        'endpoint': 'householdmember.json',
        'year':     2020,
        'extra':    {'data_type': '1'},                # ✅ 필수: 1=농가 / 2=임가 / 3=해수면어가 / 4=내수면어가
        'desc':     '농가 가구원 통계',
        'fields':   ['avg_family_member_cnt'],
        'field_prefix': 'farm_',                       # → farm_avg_family_member_cnt
    },
}

# 읍면 기본 통계는 UI의 "지역 기본 통계"에 필요한 핵심 항목만 수집한다.
# 시군 15개 × 표 수만큼 호출하므로 전체 사업체 세부 분류는 제외한다.
DONG_SGIS_TABLE_KEYS = (
    'main_stats',
    'company_all',
    'farm',
    'house',
)


# ─── SGIS 클라이언트 (인증 루프 포함) ─────────────────────────────────────

class SgisClient:
    """
    토큰 자동 갱신 클라이언트.
    JS 예제 패턴: errCd=-401(토큰 만료) → getAccessToken() 재호출 → 재시도.
    """
    MAX_REFRESH = 10

    def __init__(self, service_id: str, secret_key: str):
        self.service_id = service_id
        self.secret_key = secret_key
        self.token = None
        self.refresh_count = 0

    def authenticate(self) -> str:
        """AccessToken 발급/재발급."""
        if self.refresh_count >= self.MAX_REFRESH:
            raise RuntimeError(f"토큰 재발급 {self.MAX_REFRESH}회 초과 — 자격증명 확인 필요")
        if not self.service_id or not self.secret_key:
            raise RuntimeError(
                'SGIS_SERVICE_ID / SGIS_SECRET_KEY 환경변수 미설정.\n'
                '  $env:SGIS_SERVICE_ID = "..."; $env:SGIS_SECRET_KEY = "..."'
            )
        params = {
            'consumer_key':    self.service_id,
            'consumer_secret': self.secret_key,
        }
        try:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            r = requests.get(AUTH_URL, params=params, timeout=20, verify=False)
            body = r.json()
            err_cd = body.get('errCd')
            if err_cd not in (0, '0', None):
                raise RuntimeError(f"인증 실패 (errCd={err_cd}, errMsg={body.get('errMsg')})")
            token = body.get('result', {}).get('accessToken')
            if not token:
                raise RuntimeError(f'토큰 미발급. 응답: {body}')
            self.token = token
            self.refresh_count += 1
            if self.refresh_count == 1:
                print(f"  [auth] AccessToken 발급 성공")
            else:
                print(f"  [auth] AccessToken 재발급 ({self.refresh_count}회)")
            return token
        except Exception as e:
            raise RuntimeError(f"SGIS 인증 실패: {e}")

    def call(self, cfg: dict, year: int, adm_cd: str = '41',
             low_search: str = '1', _retry: bool = False) -> dict:
        """SGIS 통계 endpoint 호출. -401 만나면 재발급 후 1회 재시도."""
        if not self.token:
            self.authenticate()
        params = {
            'accessToken': self.token,
            'year':        str(year),
            'adm_cd':      adm_cd,
            'low_search':  low_search,
            **cfg.get('extra', {}),
        }
        try:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            r = requests.get(f"{BASE_URL}/{cfg['endpoint']}", params=params,
                             timeout=30, verify=False)
            body = r.json()
        except Exception as e:
            return {'errCd': -999, 'errMsg': f'HTTP/JSON 오류: {e}'}

        # 토큰 만료 → 1회 재시도
        if body.get('errCd') in (-401, '-401') and not _retry:
            print(f"  [auth] 토큰 만료 감지 — 재발급 후 재시도")
            self.authenticate()
            return self.call(cfg, year, adm_cd, low_search, _retry=True)
        return body


# ─── 공통 파서 (SGIS 응답 구조가 일관) ───────────────────────────────────

def parse_sgis_rows(rows: list, cfg: dict, source_id: str, year: int) -> dict:
    """
    SGIS 응답 행 → {city_id: {field: {value, year, source}}}

    매핑: SGIS adm_cd(5자리, 예 '31130') → SGIS_CODE_TO_CITY → city_id ('namyangju')
    분구 합산: 용인시(31191/31192/31193) 등 여러 행이 같은 city_id 로 매핑되면 합산.

    필드 정책:
      - 비율/평균 필드 (avg_age, ppltn_dnsty, aged_child_idx) : 가중평균 어렵고
        분구가 있는 시군 자체가 적으므로 우선 첫 값(또는 단순 평균) 사용.
        용인은 분구별 값이 비슷하므로 단순 평균으로 근사.
      - 카운트 필드 (corp_cnt, tot_worker, farm_cnt 등): 합산.
    """
    prefix       = cfg.get('field_prefix', '')
    fields       = cfg.get('fields', [])
    source       = f"sgis:{source_id}"
    year_str     = str(year)
    # 어떤 필드가 평균/비율인지 (이름 휴리스틱)
    AVG_FIELDS = {'avg_age', 'ppltn_dnsty', 'aged_child_idx', 'avg_family_member_cnt'}

    # 1차 수집: city_id 별로 모든 분구 행의 값 리스트
    bucket = {}  # cid → field → list of (value, sgis_code)
    for r in rows:
        adm_cd = str(r.get('adm_cd', '')).strip()
        if len(adm_cd) < 5: continue
        code5 = adm_cd[:5]
        cid = SGIS_CODE_TO_CITY.get(code5)
        if not cid: continue
        for f in fields:
            v = r.get(f)
            num = to_number(v)
            if num is None: continue
            bucket.setdefault(cid, {}).setdefault(f, []).append(num)

    # 2차 집계: 합산 또는 평균
    out = {}
    for cid, field_vals in bucket.items():
        out[cid] = {}
        for f, vals in field_vals.items():
            if f in AVG_FIELDS:
                # 평균 (분구 평균 — 가중치는 인구로 해야 정확하지만 현재 데이터 한계)
                aggregated = round(sum(vals) / len(vals), 2)
            else:
                # 합산 (카운트류)
                aggregated = sum(vals)
            key = f'{prefix}{f}'
            out[cid][key] = {
                'value':  aggregated,
                'year':   year_str,
                'source': source,
            }
    return out


def parse_sgis_dong_rows(rows: list, cfg: dict, source_id: str, year: int,
                         city_id: str) -> dict:
    """
    SGIS 응답 행 → {adm_cd: {field: {value, year, source}}}

    읍면동 코드는 gyeonggi-dong.geojson 의 adm_cd(예: 31070110)와 같은 SGIS 내부
    코드를 사용한다. city_id와 adm_nm도 raw에 저장해 프론트에서 이름·소속을
    안정적으로 구분한다.
    """
    prefix   = cfg.get('field_prefix', '')
    fields   = cfg.get('fields', [])
    source   = f"sgis:{source_id}"
    year_str = str(year)
    out = {}

    for r in rows:
        adm_cd = str(r.get('adm_cd', '')).strip()
        if len(adm_cd) < 8:
            continue
        rec = out.setdefault(adm_cd, {
            'city_id': {
                'value': city_id,
                'year': year_str,
                'source': source,
            },
            'adm_nm': {
                'value': str(r.get('adm_nm') or r.get('adm_nm_full') or '').strip(),
                'year': year_str,
                'source': source,
            },
        })
        for field in fields:
            num = to_number(r.get(field))
            if num is None:
                continue
            rec[f'{prefix}{field}'] = {
                'value': num,
                'year': year_str,
                'source': source,
            }
    return out


# ─── 메인 ─────────────────────────────────────────────────────────────────

def fetch_all(existing_data: dict) -> dict:
    if not SGIS_SERVICE_ID or not SGIS_SECRET_KEY:
        print('[WARN] SGIS 자격증명 미설정 — SGIS 갱신 건너뜀')
        return existing_data

    print(f'=== SGIS Open API 수집 시작 ===\n')

    client = SgisClient(SGIS_SERVICE_ID, SGIS_SECRET_KEY)
    try:
        client.authenticate()
    except Exception as e:
        print(f'\n[ERROR] 인증 실패 — SGIS 수집 중단: {e}')
        return existing_data
    print()

    new_raw_by_city = {}
    new_raw_by_dong = {}
    tables_status = {}

    for key, cfg in SGIS_TABLES.items():
        year = cfg.get('year', 2024)
        extra_str = ' '.join(f'{k}={v}' for k, v in cfg.get('extra', {}).items())
        print(f"  [{cfg['endpoint']:28s}] {cfg['desc']:40s} year={year} {extra_str}", end=' ', flush=True)

        body = client.call(cfg, year=year, adm_cd=SGIS_PROV_CODE, low_search='1')
        err_cd = body.get('errCd')
        rows = body.get('result', [])

        if err_cd in (0, '0', None) and isinstance(rows, list) and rows:
            parsed = parse_sgis_rows(rows, cfg, source_id=key, year=year)
            print(f"성공 ({len(rows)}행 → {len(parsed)} 시군 매핑)")
            for cid, fields in parsed.items():
                new_raw_by_city.setdefault(cid, {}).update(fields)
            tables_status[key] = {
                'endpoint': cfg['endpoint'].replace('.json', ''),
                'year':     year,
                'count':    len(parsed),
                'status':   'ok',
            }
        else:
            print(f"실패 (errCd={err_cd}, msg={(body.get('errMsg') or '')[:50]})")
            tables_status[key] = {
                'endpoint': cfg['endpoint'].replace('.json', ''),
                'year':     year,
                'status':   'failed',
                'errCd':    err_cd,
            }

    print('\n=== SGIS 읍면 기본 통계 수집 시작 ===\n')
    for cid, sigun_codes in SGIS_SIGUN_CODES.items():
        for sgis_code in sigun_codes:
            for key in DONG_SGIS_TABLE_KEYS:
                cfg = SGIS_TABLES[key]
                year = cfg.get('year', 2024)
                extra_str = ' '.join(f'{k}={v}' for k, v in cfg.get('extra', {}).items())
                print(f"  [{cid:12s} {sgis_code} {key:12s}] {cfg['desc']} year={year} {extra_str}", end=' ', flush=True)
                body = client.call(cfg, year=year, adm_cd=sgis_code, low_search='1')
                err_cd = body.get('errCd')
                rows = body.get('result', [])
                status_key = f'sgis_dong_{key}'

                if err_cd in (0, '0', None) and isinstance(rows, list) and rows:
                    parsed = parse_sgis_dong_rows(rows, cfg, source_id=f'dong_{key}', year=year, city_id=cid)
                    print(f"성공 ({len(rows)}행 → {len(parsed)} 읍면)")
                    for adm_cd, fields in parsed.items():
                        new_raw_by_dong.setdefault(adm_cd, {}).update(fields)
                    prev = tables_status.get(status_key, {
                        'endpoint': cfg['endpoint'].replace('.json', ''),
                        'year': year,
                        'count': 0,
                        'status': 'ok',
                    })
                    prev['count'] = prev.get('count', 0) + len(parsed)
                    tables_status[status_key] = prev
                else:
                    print(f"실패 (errCd={err_cd}, msg={(body.get('errMsg') or '')[:50]})")
                    tables_status.setdefault(status_key, {
                        'endpoint': cfg['endpoint'].replace('.json', ''),
                        'year': year,
                        'count': 0,
                        'status': 'partial',
                        'errCd': err_cd,
                    })

    # source-aware 병합 — SGIS raw 만 덮어씀
    merge_raw_by_source(existing_data, new_raw_by_city, 'sgis')
    merge_dong_raw_by_source(existing_data, new_raw_by_dong, 'sgis')

    # _meta.tables 의 SGIS 항목 갱신
    existing_data['_meta'].setdefault('tables', {})
    for k, v in tables_status.items():
        existing_data['_meta']['tables'][f'sgis_{k}'] = v
    existing_data['_meta']['fetched_at'] = datetime.now().isoformat()
    existing_data['_meta']['source'] = 'kosis_api + sgis_api + manual'

    # 커버리지 리포트
    print('\n=== SGIS Coverage 리포트 ===')
    for key, s in tables_status.items():
        cfg = SGIS_TABLES.get(key, {})
        if s.get('status') == 'ok':
            print(f"  ✅ [{key:24s}] {s.get('count', 0):2d}개 시군 (year={s.get('year', '?')}) | {cfg.get('desc','')}")
        else:
            print(f"  ❌ [{key:24s}] 실패 (errCd={s.get('errCd', '?')}) | {cfg.get('desc','')}")

    n_sgis = sum(1 for cid in SIGUN_CODES
                 for v in existing_data['sigun'].get(cid, {}).get('raw', {}).values()
                 if isinstance(v, dict) and str(v.get('source','')).startswith('sgis:'))
    n_dong_sgis = sum(1 for adm_cd in existing_data.get('dong', {})
                      for v in existing_data['dong'].get(adm_cd, {}).get('raw', {}).values()
                      if isinstance(v, dict) and str(v.get('source','')).startswith('sgis:'))
    print(f"\n  📊 SGIS raw 필드 총 {n_sgis}개 (15시군 × 평균 {n_sgis//15 if n_sgis else 0}개)")
    print(f"  📍 SGIS 읍면 raw 필드 총 {n_dong_sgis}개 ({len(existing_data.get('dong', {}))}개 읍면)")
    print(f"  🔄 토큰 발급 {client.refresh_count}회\n")
    return existing_data


def main():
    data = load_full_meta()
    data = fetch_all(data)
    recompute_all(data)
    data['_meta']['coverage'] = {
        'sigun': sum(1 for d in data['sigun'].values() if d.get('raw')),
        'dong':  len(data.get('dong', {})),
    }
    save_meta(data)


if __name__ == '__main__':
    main()
