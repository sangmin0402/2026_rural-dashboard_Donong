#!/usr/bin/env python3
"""
KOSIS Open API — 경기도 15개 시군 통계 수집 → region-meta.json 생성.

== 3-layer 스키마 ==
  raw      : KOSIS 원본 값 (자동 갱신)
  computed : raw로부터 계산된 산식 지표 (자동 계산, fetch_kosis.py 재실행 시 재계산)
  manual   : 사용자가 직접 입력한 값 (KOSIS 외 출처) — 스크립트가 보존

== 활성 테이블 (Tier 1) ==
  sigun_pop              — DT_1B040A3 : 시군구별 인구 (현재 + 12개월 전 → L1 계산용)
  sigun_hh               — DT_1B040B3 : 시군구별 세대수
  sigun_migration        — DT_1B26001 : 시군구별 인구이동 (L3 입력)
  sigun_grdp             — DT_1C81    : 시군구별 GRDP (W4 입력)
  sigun_immigration_rural— DT_1ET2002 : 시군구별 귀농귀촌인 (L5/L6/W6 입력)
  sigun_birth_rate       — DT_1B81A21 : 시군구별 합계출산율 (보조 지표)

== 비활성 테이블 (40k 셀 또는 차원 코드 미확인) ==
  sigun_age  / sigun_biz / dong_pop  — TABLES dict 주석 해제 시 활성화 가능.

실행 (PowerShell):
  $env:KOSIS_API_KEY = "발급받은_키"
  python fetch_kosis.py

출력: ../dat/region-meta.json
"""

import os, sys, json
from pathlib import Path
from datetime import datetime

# Windows 콘솔 cp949 환경에서 한글 출력
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

try:
    import requests
except ImportError:
    print('[ERROR] requests 미설치. `pip install requests` 실행하세요.', file=sys.stderr)
    sys.exit(1)


# ─── 상수 ─────────────────────────────────────────────────────────────────────

API_KEY  = os.environ.get('KOSIS_API_KEY', '').strip()
BASE_URL = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'
OUT_PATH = Path(__file__).parent / '..' / 'dat' / 'region-meta.json'

# 경기도 15개 시군 코드 매핑 (city_id → 5자리 행정구역 코드)
SIGUN_CODES = {
    'pyeongtaek':  '41220', 'namyangju':   '41360', 'yongin':      '41460',
    'icheon':      '41500', 'anseong':     '41550', 'hwaseong':    '41590',
    'gwangju':     '41610', 'yangju':      '41630', 'pocheon':     '41650',
    'yeoju':       '41670', 'gapyeong':    '41820', 'yangpyeong':  '41830',
    'osan':        '41370', 'hanam':       '41450', 'dongducheon': '41250',
}
CODE_TO_CITY = {v: k for k, v in SIGUN_CODES.items()}  # 역매핑


# ─── 통계표 설정 ─────────────────────────────────────────────────────────────
#  새 테이블 추가 시:
#   1) TABLES dict 에 1항목 추가
#   2) 하단에 parse_<key>() 함수 추가
#   3) fetch_all() 의 PARSERS dict 에 키 추가
#   4) (옵션) compute_indicators() 에 산식 추가

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

    # ── 비활성: KOSIS API 제약 사항 ────────────────────────────────────────────
    # ★ 검증 결과 (2026-05 기준) ★
    #
    # [시도 단위만 제공 — 시군구 데이터 미공개]
    #   DT_1B26001 (인구이동)    — C1=시도 코드만 ('41'=경기 전체). 시군구 breakdown 없음.
    #   DT_1C81    (GRDP)        — 시도 단위만, 시군구 별도 표 미확인.
    #   DT_1B81A21 (합계출산율)  — 시도 단위만, 코드체계도 KOSIS 내부 ('31'=경기).
    #
    # [40k 셀 초과 — 차원 코드 미확인]
    #   DT_1IN1502   (연령별 인구) → L2 노령화지수 계산 필요
    #   DT_1B040M1   (읍면동별 인구) → 읍면 패널용
    #   DT_1K51003   (사업체조사) → W2 사업체수, W8 서비스종사자
    #
    # [테이블 ID 미확인]
    #   귀농귀촌 통계 (DT_1ET2002, DT_113N_* 등) — 모두 ERR 21 (해당 표 없음)
    #
    # ⇒ 시군구별 GRDP/고용률/출산율 등은 KOSIS 웹 다운로드(Excel) 또는
    #    별도 행정자료원(지방재정365, 농산물품질관리원) 필요.
    #    이 데이터들은 region-meta.json 의 manual 층에 수동 입력으로 채울 수 있음.
}


# ─── KOSIS fetch ──────────────────────────────────────────────────────────────

def fetch_raw(table_key: str):
    """TABLES dict 기반 통일 fetch. 실패 시 None 반환."""
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
            err_msg = data.get('errMsg', str(data))
            print(f"실패 (KOSIS 에러 {data.get('err')}: {err_msg})")
            print(f"    → tblId={cfg['tblId']} 재확인 필요. KOSIS 통계 목록: https://kosis.kr/openapi/")
            return None
        if not isinstance(data, list):
            print(f"실패 (예상치 않은 응답 형식: {type(data).__name__})")
            return None
        if len(data) == 0:
            print(f"실패 (빈 응답 — 기간/코드 파라미터 확인 필요)")
            return None
        print(f"성공 ({len(data):,}행)")
        return data
    except requests.exceptions.Timeout:
        print(f"실패 (타임아웃 60초 초과)")
        return None
    except Exception as e:
        print(f"실패 ({type(e).__name__}: {e})")
        return None


# ─── 공통 헬퍼 ───────────────────────────────────────────────────────────────

def _to_int(v) -> int:
    try:
        return int(str(v).replace(',', '').strip())
    except (ValueError, TypeError):
        return 0

def _to_float(v) -> float:
    try:
        return float(str(v).replace(',', '').strip())
    except (ValueError, TypeError):
        return 0.0

def _extract_code(row: dict, n_digits: int):
    """행에서 경기도 코드(41 시작 + n자리)를 추출."""
    for key in ('C1', 'C2', 'C3', 'C4'):
        val = str(row.get(key, '')).strip()
        if len(val) >= n_digits and val[:2] == '41':
            return val[:n_digits]
    return None

def _discover_itm_ids(rows: list, max_show: int = 10) -> dict:
    """rows에서 고유 ITM_ID → ITM_NM 매핑 추출 (로그용)."""
    seen = {}
    for r in rows:
        iid = str(r.get('ITM_ID', '')).strip()
        inm = str(r.get('ITM_NM', iid)).strip()
        if iid and iid not in seen:
            seen[iid] = inm
            if len(seen) >= max_show:
                break
    return seen

def _find_itm_id(itm_ids: dict, keywords: list, fallback_first: bool = False):
    """ITM_NM에 keyword가 있는 첫 ITM_ID 반환. 못 찾으면 None 또는 첫 ITM_ID."""
    for iid, nm in itm_ids.items():
        if any(kw in nm for kw in keywords):
            return iid
    return next(iter(itm_ids)) if (fallback_first and itm_ids) else None


# ─── 파서 ─────────────────────────────────────────────────────────────────────

def parse_sigun_pop(rows: list) -> dict:
    """
    DT_1B040A3 (13개월 호출) → {city_id: {population, population_prev, _period, _period_population_prev}}
    - population: 가장 최근 PRD_DE의 총인구
    - population_prev: 가장 오래된 PRD_DE의 총인구 (12개월 전)
    """
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:6]} }")

    pop_id = _find_itm_id(itm_ids, ['총인구', '인구수', '총 인구'], fallback_first=True)

    # city_id → {period → pop_value}
    by_city = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        if str(r.get('ITM_ID', '')).strip() != pop_id:
            continue
        val = _to_int(r.get('DT', 0))
        if val <= 0:
            continue
        city_id = CODE_TO_CITY[code5]
        period = str(r.get('PRD_DE', ''))
        by_city.setdefault(city_id, {})[period] = val

    result = {}
    for city_id, period_map in by_city.items():
        periods = sorted(period_map.keys())
        if not periods:
            continue
        latest = periods[-1]
        entry = {'population': period_map[latest], '_period': latest}
        # 12개월 전 데이터: 가장 오래된 period (13개월 호출 시 1년 전)
        if len(periods) >= 12:
            earliest = periods[0]
            entry['population_prev'] = period_map[earliest]
            entry['_period_population_prev'] = earliest
        result[city_id] = entry
    return result


def parse_sigun_hh(rows: list) -> dict:
    """DT_1B040B3 → {city_id: {households, _period}}"""
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: {itm_ids}")

    hh_id = _find_itm_id(itm_ids, ['세대', '가구'], fallback_first=True)

    result = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        if str(r.get('ITM_ID', '')).strip() != hh_id:
            continue
        val = _to_int(r.get('DT', 0))
        if val <= 0:
            continue
        city_id = CODE_TO_CITY[code5]
        period = str(r.get('PRD_DE', ''))
        result[city_id] = {'households': val, '_period': period}
    return result


def parse_sigun_migration(rows: list) -> dict:
    """DT_1B26001 → {city_id: {inflow, outflow, net_migration, _period}}"""
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:8]} }")

    inflow_id  = _find_itm_id(itm_ids, ['전입', '유입'])
    outflow_id = _find_itm_id(itm_ids, ['전출', '유출'])
    net_id     = _find_itm_id(itm_ids, ['순이동'])

    result = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        city_id = CODE_TO_CITY[code5]
        iid = str(r.get('ITM_ID', '')).strip()
        val = _to_int(r.get('DT', 0))
        period = str(r.get('PRD_DE', ''))
        if city_id not in result:
            result[city_id] = {'_period': period}
        if inflow_id and iid == inflow_id and val > 0:
            result[city_id]['inflow'] = val
        if outflow_id and iid == outflow_id and val > 0:
            result[city_id]['outflow'] = val
        if net_id and iid == net_id:
            # 순이동은 음수일 수 있음
            try:
                result[city_id]['net_migration'] = _to_int(r.get('DT', 0)) if str(r.get('DT', '0')).strip().lstrip('-').isdigit() else 0
            except Exception:
                pass

    # inflow/outflow 둘 다 없는 시군은 제거
    for cid in list(result.keys()):
        keys = set(result[cid].keys()) - {'_period'}
        if not keys:
            del result[cid]
    return result


def parse_sigun_grdp(rows: list) -> dict:
    """DT_1C81 → {city_id: {grdp, _period}} (단위: 백만원 → 억원 환산)"""
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:6]} }")

    # 지역내총생산 (당해년가격) — 명목 GRDP 우선
    grdp_id = _find_itm_id(itm_ids, ['지역내총생산', '명목 총생산', 'GRDP'])
    if not grdp_id:
        grdp_id = _find_itm_id(itm_ids, ['총생산'], fallback_first=True)

    result = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        if str(r.get('ITM_ID', '')).strip() != grdp_id:
            continue
        val_raw = r.get('DT', 0)
        val = _to_int(val_raw)
        if val <= 0:
            continue
        city_id = CODE_TO_CITY[code5]
        period = str(r.get('PRD_DE', ''))
        unit = str(r.get('UNIT_NM', ''))
        # 단위 환산: 백만원 → 억원 (÷100)
        if '백만' in unit:
            val = round(val / 100)
        result[city_id] = {'grdp': val, '_period': period, '_grdp_unit': '억원'}
    return result


def parse_sigun_immigration_rural(rows: list) -> dict:
    """DT_1ET2002 → {city_id: {rural_returnees, farm_returnees, _period}}"""
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:8]} }")

    returnee_id = _find_itm_id(itm_ids, ['귀촌인', '귀촌'])
    farm_id     = _find_itm_id(itm_ids, ['귀농인', '귀농'])

    result = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        city_id = CODE_TO_CITY[code5]
        iid = str(r.get('ITM_ID', '')).strip()
        val = _to_int(r.get('DT', 0))
        period = str(r.get('PRD_DE', ''))
        if city_id not in result:
            result[city_id] = {'_period': period}
        if returnee_id and iid == returnee_id and val > 0:
            result[city_id]['rural_returnees'] = val
        if farm_id and iid == farm_id and val > 0:
            result[city_id]['farm_returnees'] = val

    for cid in list(result.keys()):
        keys = set(result[cid].keys()) - {'_period'}
        if not keys:
            del result[cid]
    return result


def parse_sigun_birth_rate(rows: list) -> dict:
    """DT_1B81A21 → {city_id: {birth_rate, _period}}"""
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:4]} }")

    br_id = _find_itm_id(itm_ids, ['합계출산율', '출산율'], fallback_first=True)

    result = {}
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        if str(r.get('ITM_ID', '')).strip() != br_id:
            continue
        raw_val = str(r.get('DT', '')).strip()
        if not raw_val:
            continue
        val = _to_float(raw_val)
        if val <= 0:
            continue
        city_id = CODE_TO_CITY[code5]
        period = str(r.get('PRD_DE', ''))
        result[city_id] = {'birth_rate': round(val, 2), '_period': period}
    return result


# ─── 산식 계산 ───────────────────────────────────────────────────────────────

def compute_indicators(raw: dict) -> dict:
    """
    raw 데이터(3-layer raw 층)로부터 산식 기반 지표 계산.
    입력 형식: {field: {'value': ..., 'year': ..., 'source': ...}}
    반환 형식: {indicator_key: {'value': ..., 'formula': ..., 'inputs': {...}}}
    """
    computed = {}

    def get(field):
        rec = raw.get(field)
        return rec.get('value') if isinstance(rec, dict) else None

    # ── L1: 인구증가율 = (현재인구 - 전년인구) / 전년인구 × 100 ──
    pop  = get('population')
    prev = get('population_prev')
    if pop and prev and prev > 0:
        computed['L1_pop_growth_rate'] = {
            'value':   round((pop - prev) / prev * 100, 2),
            'unit':    '%',
            'formula': '(현재인구 - 전년인구) / 전년인구 × 100',
            'inputs':  {'population': pop, 'population_prev': prev},
        }

    # ── L3: 인구순이동률 = (전입 - 전출) / 총인구 × 1000 ──
    inflow  = get('inflow')
    outflow = get('outflow')
    if inflow is not None and outflow is not None and pop and pop > 0:
        computed['L3_net_migration_rate'] = {
            'value':   round((inflow - outflow) / pop * 1000, 2),
            'unit':    '‰',
            'formula': '(전입 - 전출) / 총인구 × 1000',
            'inputs':  {'inflow': inflow, 'outflow': outflow, 'population': pop},
        }

    # 향후 추가: L2, W6 등 raw 데이터 확보되는 대로

    return computed


# ─── manual 층 보존 ──────────────────────────────────────────────────────────

def load_existing_manual() -> dict:
    """기존 region-meta.json에서 manual 층만 읽어와 보존."""
    if not OUT_PATH.exists():
        return {}
    try:
        with open(OUT_PATH, encoding='utf-8') as f:
            old = json.load(f)
        manual = {}
        for cid, data in old.get('sigun', {}).items():
            if isinstance(data, dict) and data.get('manual'):
                manual[cid] = data['manual']
        if manual:
            print(f"[manual 보존] 기존 region-meta.json에서 {len(manual)}개 시군의 수동 입력값 보존")
        return manual
    except Exception as e:
        print(f"[WARN] 기존 region-meta.json 로딩 실패 (manual 층 보존 못함): {e}")
        return {}


# ─── 병합 (3-layer 스키마) ───────────────────────────────────────────────────

def merge_all(parsed: dict, existing_manual: dict = None) -> dict:
    """파서 결과 → 3-layer 스키마 (raw / computed / manual)."""
    existing_manual = existing_manual or {}
    sigun = {cid: {'raw': {}, 'computed': {}, 'manual': {}} for cid in SIGUN_CODES}
    tables = {}

    # ── raw 층 채우기 ──
    for tbl_key, parser_data in parsed.items():
        cfg     = TABLES.get(tbl_key, {})
        tbl_id  = cfg.get('tblId', '')
        source  = f"kosis:{tbl_id}"
        sample_period = ''
        success_cids  = set()

        for cid, vals in parser_data.items():
            base_period = vals.get('_period', '')
            sample_period = sample_period or base_period
            for k, v in vals.items():
                if k.startswith('_'):
                    continue
                # 필드별 기간 override (예: _period_population_prev)
                field_period = vals.get(f'_period_{k}', base_period)
                sigun[cid]['raw'][k] = {
                    'value':  v,
                    'year':   field_period,
                    'source': source,
                }
                success_cids.add(cid)

        tables[tbl_key] = {
            'tblId':  tbl_id,
            'period': sample_period,
            'count':  len(success_cids),
            'status': 'ok',
        }

    # 호출 실패한 테이블도 기록
    for tbl_key in TABLES:
        if tbl_key not in tables:
            tables[tbl_key] = {'tblId': TABLES[tbl_key]['tblId'], 'status': 'failed'}

    # ── computed 층 계산 ──
    for cid in sigun:
        sigun[cid]['computed'] = compute_indicators(sigun[cid]['raw'])

    # ── manual 층 복원 ──
    for cid, manual_data in existing_manual.items():
        if cid in sigun and isinstance(manual_data, dict):
            sigun[cid]['manual'] = manual_data

    return {
        '_meta': {
            'source':     'kosis_api + manual',
            'fetched_at': datetime.now().isoformat(),
            'schema':     '3-layer (raw / computed / manual)',
            'tables':     tables,
            'coverage': {
                'sigun': sum(1 for d in sigun.values() if d['raw']),
                'dong':  0,
            },
            'note': '읍면동 데이터: KOSIS API 차원 코드 미확인으로 현재 비활성. TABLES dict 활성화 후 재실행 가능.',
        },
        'sigun': sigun,
        'dong':  {},
    }


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def fetch_all() -> dict:
    if not API_KEY:
        print('[WARN] KOSIS_API_KEY 환경변수 미설정 — placeholder JSON 생성')
        return {
            '_meta': {
                'source': 'placeholder',
                'note':   'KOSIS API 키 없음. $env:KOSIS_API_KEY 설정 후 재실행.',
            },
            'sigun': {cid: {'raw': {}, 'computed': {}, 'manual': {}} for cid in SIGUN_CODES},
            'dong':  {},
        }

    print('=== KOSIS Open API 수집 시작 ===\n')

    # TABLES dict 키 ↔ parser 함수 매핑 (신규 활성화 시 여기도 추가)
    PARSERS = {
        'sigun_pop': parse_sigun_pop,
        'sigun_hh':  parse_sigun_hh,
        # 아래 parser 들은 비활성 TABLES 활성화 시 함께 등록
        # 'sigun_migration':        parse_sigun_migration,
        # 'sigun_grdp':             parse_sigun_grdp,
        # 'sigun_immigration_rural':parse_sigun_immigration_rural,
        # 'sigun_birth_rate':       parse_sigun_birth_rate,
    }

    # 기존 manual 층 보존 (덮어쓰기 전에 읽기)
    existing_manual = load_existing_manual()

    parsed = {}
    for key, parser in PARSERS.items():
        try:
            rows = fetch_raw(key)
            if rows:
                parsed[key] = parser(rows)
                print(f"    → {len(parsed[key])} 지역 파싱 완료\n")
            else:
                print()
        except Exception as e:
            import traceback
            print(f"\n    [ERROR] {key} 파싱 중 예외: {e}")
            traceback.print_exc()
            print()

    result = merge_all(parsed, existing_manual)

    # ── 커버리지 리포트 ──
    print('=== Coverage 리포트 ===')
    for tbl, s in result['_meta']['tables'].items():
        cfg = TABLES.get(tbl, {})
        if s.get('status') == 'ok':
            print(f"  ✅ [{tbl}] {s.get('count', 0)}개 시군, 기준: {s.get('period', '?')} | {cfg.get('desc','')} ({s.get('tblId', '')})")
        else:
            print(f"  ❌ [{tbl}] 실패 ({cfg.get('desc','')}) — tblId/orgId/extra 파라미터 확인 필요")
    print(f"\n  📊 시군 raw 데이터 보유: {result['_meta']['coverage']['sigun']}/15")

    # computed 통계
    n_computed = sum(1 for d in result['sigun'].values() if d.get('computed'))
    n_manual   = sum(1 for d in result['sigun'].values() if d.get('manual'))
    print(f"  🧮 computed 지표 보유: {n_computed}/15 (산식 계산값)")
    print(f"  ✍️  manual 입력 보유: {n_manual}/15 (수동 입력값)\n")

    return result


def main():
    data = fetch_all()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    size_kb = os.path.getsize(OUT_PATH) // 1024
    print(f'[완료] {OUT_PATH} 저장 ({size_kb} KB)')


if __name__ == '__main__':
    main()
