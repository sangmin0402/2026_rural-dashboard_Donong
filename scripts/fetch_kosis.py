#!/usr/bin/env python3
"""
KOSIS Open API — 경기도 15개 시군 통계 수집 → region-meta.json 갱신.

공통 로직(스키마·산식·로드/저장)은 `lib_meta.py`에서 가져옴.
SGIS 데이터(`fetch_sgis.py`로 수집)와 협업: 자기 source ('kosis:*') raw 만 덮어쓰고
다른 source 의 raw 와 manual 층은 보존.

== 활성 테이블 (Tier 1) ==
  sigun_pop  — DT_1B040A3 : 시군구별 인구 (현재 + 12개월 전 → L1 계산용)
  sigun_hh   — DT_1B040B3 : 시군구별 세대수

비활성/제약 상세: `docs/DATA-SOURCES.md` 참조.

실행:
  $env:KOSIS_API_KEY = "발급받은_키"
  python fetch_kosis.py
"""

import os, sys, json
from pathlib import Path
from datetime import datetime

# 공통 모듈 (같은 디렉토리)
sys.path.insert(0, str(Path(__file__).parent))
from lib_meta import (
    SIGUN_CODES, CODE_TO_CITY,
    to_int, to_float, to_number,
    load_full_meta, save_meta, recompute_all, merge_raw_by_source,
)

# Windows 콘솔 한글 출력
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass

try:
    import requests
except ImportError:
    print('[ERROR] requests 미설치. `pip install requests`', file=sys.stderr)
    sys.exit(1)


# ─── 상수 ─────────────────────────────────────────────────────────────────

API_KEY  = os.environ.get('KOSIS_API_KEY', '').strip()
BASE_URL = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'


# ─── 통계표 설정 ─────────────────────────────────────────────────────────
#  새 테이블 추가 시:
#   1) TABLES dict 에 1항목 추가
#   2) parse_<key>() 함수 추가
#   3) PARSERS dict 에 키 등록

TABLES = {
    'sigun_pop': {
        'orgId': '101', 'tblId': 'DT_1B040A3',
        'prdSe': 'M',   'newEstPrdCnt': '13',   # 13개월 (현재 + 12개월 전)
        'extra': {'itmId': 'ALL'},
        'desc':  '시군구별 주민등록인구 (현재 + 전년)',
    },
    'sigun_hh': {
        'orgId': '101', 'tblId': 'DT_1B040B3',
        'prdSe': 'M',   'newEstPrdCnt': '1',
        'extra': {'itmId': 'ALL'},
        'desc':  '시군구별 주민등록세대수',
    },

    # ── 비활성 (KOSIS Open API 제약) — 자세한 내용은 docs/DATA-SOURCES.md ──
    #   DT_1B26001 인구이동      → 시도 단위만, 시군구 breakdown 없음
    #   DT_1C81    GRDP          → 시도 단위만
    #   DT_1B81A21 합계출산율    → 시도 단위만
    #   DT_1IN1502 연령별 인구   → 40k 셀 초과 (SGIS aging_idx 로 대체)
    #   DT_1K51003 사업체조사    → 40k 셀 초과 (SGIS company.json 으로 대체)
    #   DT_1B040M1 읍면동 인구   → 40k 셀 초과
}


# ─── KOSIS API 호출 ──────────────────────────────────────────────────────

def fetch_raw(table_key: str):
    """TABLES dict 기반 통일 fetch. 실패 시 None."""
    cfg = TABLES[table_key]
    params = {
        'method':       'getList',
        'apiKey':       API_KEY,
        'format':       'json',
        'jsonVD':       'Y',
        'orgId':        cfg['orgId'],
        'tblId':        cfg['tblId'],
        'objL1':        'ALL',
        'prdSe':        cfg['prdSe'],
        'newEstPrdCnt': cfg['newEstPrdCnt'],
        **cfg.get('extra', {}),
    }
    print(f"  [{table_key}] {cfg['desc']} 호출 중…", end=' ', flush=True)
    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        r = requests.get(BASE_URL, params=params, timeout=60, verify=False)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and data.get('err'):
            print(f"실패 (KOSIS 에러 {data.get('err')}: {data.get('errMsg', '?')})")
            return None
        if not isinstance(data, list) or len(data) == 0:
            print(f"실패 (응답 형식 또는 빈 응답)")
            return None
        print(f"성공 ({len(data):,}행)")
        return data
    except Exception as e:
        print(f"실패 ({type(e).__name__}: {e})")
        return None


# ─── 공통 헬퍼 ───────────────────────────────────────────────────────────

def _extract_code(row: dict, n_digits: int):
    """행에서 경기도 코드(41 시작 + n자리)를 추출."""
    for key in ('C1', 'C2', 'C3', 'C4'):
        val = str(row.get(key, '')).strip()
        if len(val) >= n_digits and val[:2] == '41':
            return val[:n_digits]
    return None

def _discover_itm_ids(rows: list, max_show: int = 10) -> dict:
    seen = {}
    for r in rows:
        iid = str(r.get('ITM_ID', '')).strip()
        inm = str(r.get('ITM_NM', iid)).strip()
        if iid and iid not in seen:
            seen[iid] = inm
            if len(seen) >= max_show: break
    return seen

def _find_itm_id(itm_ids: dict, keywords: list, fallback_first: bool = False):
    for iid, nm in itm_ids.items():
        if any(kw in nm for kw in keywords): return iid
    return next(iter(itm_ids)) if (fallback_first and itm_ids) else None


# ─── 파서 ─────────────────────────────────────────────────────────────────

def parse_sigun_pop(rows: list) -> dict:
    """
    DT_1B040A3 (13개월) → {city_id: {population, population_prev, _period, _period_population_prev}}
    """
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:6]} }")
    pop_id = _find_itm_id(itm_ids, ['총인구', '인구수', '총 인구'], fallback_first=True)

    by_city = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY: continue
        if str(r.get('ITM_ID', '')).strip() != pop_id: continue
        val = to_int(r.get('DT', 0))
        if val <= 0: continue
        cid = CODE_TO_CITY[code5]
        period = str(r.get('PRD_DE', ''))
        by_city.setdefault(cid, {})[period] = val

    result = {}
    for cid, period_map in by_city.items():
        periods = sorted(period_map.keys())
        if not periods: continue
        latest = periods[-1]
        entry = {'population': period_map[latest], '_period': latest}
        if len(periods) >= 12:
            earliest = periods[0]
            entry['population_prev'] = period_map[earliest]
            entry['_period_population_prev'] = earliest
        result[cid] = entry
    return result


def parse_sigun_hh(rows: list) -> dict:
    """DT_1B040B3 → {city_id: {households, _period}}"""
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: {itm_ids}")
    hh_id = _find_itm_id(itm_ids, ['세대', '가구'], fallback_first=True)

    result = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY: continue
        if str(r.get('ITM_ID', '')).strip() != hh_id: continue
        val = to_int(r.get('DT', 0))
        if val <= 0: continue
        cid = CODE_TO_CITY[code5]
        period = str(r.get('PRD_DE', ''))
        result[cid] = {'households': val, '_period': period}
    return result


# ─── 파서 결과 → raw 형식 변환 ────────────────────────────────────────────

def parser_to_raw(parser_data: dict, tbl_cfg: dict) -> dict:
    """
    파서 결과 {city_id: {field: value, _period: str}} →
    raw 형식 {city_id: {field: {value, year, source}}}
    """
    tbl_id = tbl_cfg.get('tblId', '')
    source = f"kosis:{tbl_id}"
    out = {}
    for cid, vals in parser_data.items():
        base_period = vals.get('_period', '')
        out[cid] = {}
        for k, v in vals.items():
            if k.startswith('_'): continue
            field_period = vals.get(f'_period_{k}', base_period)
            out[cid][k] = {
                'value':  v,
                'year':   field_period,
                'source': source,
            }
    return out


# ─── 메인 ─────────────────────────────────────────────────────────────────

def fetch_all(existing_data: dict) -> dict:
    if not API_KEY:
        print('[WARN] KOSIS_API_KEY 환경변수 미설정 — KOSIS 갱신 건너뜀')
        return existing_data

    print('=== KOSIS Open API 수집 시작 ===\n')

    PARSERS = {
        'sigun_pop': parse_sigun_pop,
        'sigun_hh':  parse_sigun_hh,
    }

    new_raw_by_city = {}     # 모든 KOSIS raw 통합 → source='kosis:*'
    tables_status = {}

    for key, parser in PARSERS.items():
        try:
            rows = fetch_raw(key)
            if rows:
                parser_result = parser(rows)
                print(f"    → {len(parser_result)} 지역 파싱 완료")
                raw_form = parser_to_raw(parser_result, TABLES[key])
                # 시군별 병합
                for cid, fields in raw_form.items():
                    new_raw_by_city.setdefault(cid, {}).update(fields)
                # 상태 기록
                sample_period = next((v.get('_period', '') for v in parser_result.values()), '')
                tables_status[key] = {
                    'tblId':  TABLES[key]['tblId'],
                    'period': sample_period,
                    'count':  len(parser_result),
                    'status': 'ok',
                }
                print()
            else:
                tables_status[key] = {'tblId': TABLES[key]['tblId'], 'status': 'failed'}
                print()
        except Exception as e:
            import traceback
            print(f"\n    [ERROR] {key} 파싱 중 예외: {e}")
            traceback.print_exc()
            tables_status[key] = {'tblId': TABLES[key]['tblId'], 'status': 'failed'}
            print()

    # KOSIS source raw 만 source-aware 병합
    merge_raw_by_source(existing_data, new_raw_by_city, 'kosis')

    # _meta.tables 의 KOSIS 항목 갱신
    existing_data['_meta'].setdefault('tables', {}).update(tables_status)
    existing_data['_meta']['fetched_at'] = datetime.now().isoformat()
    existing_data['_meta']['source'] = (
        'kosis_api + sgis_api + manual'
        if any(str(v.get('source','')).startswith('sgis:')
               for cid in SIGUN_CODES
               for v in existing_data['sigun'].get(cid, {}).get('raw', {}).values()
               if isinstance(v, dict))
        else 'kosis_api + manual'
    )

    # ── 커버리지 리포트 ──
    print('=== KOSIS Coverage 리포트 ===')
    for tbl, s in tables_status.items():
        cfg = TABLES.get(tbl, {})
        if s.get('status') == 'ok':
            print(f"  ✅ [{tbl}] {s.get('count', 0)}개 시군, 기준: {s.get('period', '?')} | {cfg.get('desc','')} ({s.get('tblId', '')})")
        else:
            print(f"  ❌ [{tbl}] 실패 ({cfg.get('desc','')})")
    n_kosis = sum(1 for cid in SIGUN_CODES
                  for v in existing_data['sigun'].get(cid, {}).get('raw', {}).values()
                  if isinstance(v, dict) and str(v.get('source','')).startswith('kosis:'))
    print(f"  📊 KOSIS raw 필드 총 {n_kosis}개\n")
    return existing_data


def main():
    # 기존 region-meta.json 로드 (SGIS raw + manual 보존)
    data = load_full_meta()
    data = fetch_all(data)
    # computed 재계산 (raw 변경 반영)
    recompute_all(data)
    # coverage 갱신
    data['_meta']['coverage'] = {
        'sigun': sum(1 for d in data['sigun'].values() if d.get('raw')),
        'dong':  len(data.get('dong', {})),
    }
    save_meta(data)


if __name__ == '__main__':
    main()
