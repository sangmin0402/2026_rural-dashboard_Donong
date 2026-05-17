#!/usr/bin/env python3
"""
KOSIS Open API — 경기도 15개 시군 + 읍면동 실제 통계 수집 → region-meta.json 생성.

통계표 구성 (TABLES dict — 새 표 추가 시 1항목만 추가):
  sigun_pop  — DT_1B040A3 : 주민등록인구 (시군구별)
  dong_pop   — DT_1B040M1 : 주민등록인구 (읍면동별)
  sigun_age  — DT_1IN1502 : 연령별 인구 → 고령화율·청년비율 계산
  sigun_biz  — DT_1K52001 : 사업체조사 (사업체수·종사자수)

실행 (PowerShell):
  $env:KOSIS_API_KEY = "YTE3ZTQ5NmQ1MTA1NTJkNmY5NTg0YThlODZjMjhhYmY="
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
#  새 테이블 추가 시 여기에 1항목 + 하단에 parse_* 함수 1개만 추가.
TABLES = {
    'sigun_pop': {
        'orgId': '101', 'tblId': 'DT_1B040A3',
        'prdSe': 'M',   'newEstPrdCnt': '1',
        'extra': {'itmId': 'ALL'},   # objL1=ALL 단일 차원, itmId 필수
        'desc':  '시군구별 주민등록인구',
    },
    'sigun_hh': {
        'orgId': '101', 'tblId': 'DT_1B040B3',
        'prdSe': 'M',   'newEstPrdCnt': '1',
        'extra': {'itmId': 'ALL'},   # objL1=ALL 단일 차원
        'desc':  '시군구별 주민등록세대수',
    },
    # ── 이하: 40,000 셀 초과 또는 dimension 코드 미확인으로 현재 비활성 ──────
    # 연령별 인구 (DT_1IN1502): objL1=ALL&itmId=ALL → 40,000셀 초과.
    #   KOSIS 내부 분류코드 확인 후 특정 ITM_ID 지정 시 활성화 가능.
    # 'sigun_age': {
    #     'orgId': '101', 'tblId': 'DT_1IN1502',
    #     'prdSe': 'Y',   'newEstPrdCnt': '1',
    #     'extra': {'itmId': 'T65+코드,T0-14코드'},  # 실제 ITM_ID 확인 후 기입
    #     'desc':  '시군구별 연령별 인구',
    # },
    # 사업체조사 (DT_1K51003): objL1=ALL&objL2=ALL&itmId=ALL → 40,000셀 초과.
    #   전산업 합계 objL1 코드 확인 후 활성화 가능.
    # 'sigun_biz': {
    #     'orgId': '101', 'tblId': 'DT_1K51003',
    #     'prdSe': 'Y',   'newEstPrdCnt': '1',
    #     'extra': {'objL2': 'ALL', 'itmId': 'ALL'},
    #     'desc':  '시군구별 사업체수',
    # },
    # 읍면동별 인구 (DT_1B040M1): 3개 차원 필요, 40,000셀 초과.
    # 'dong_pop': {
    #     'orgId': '101', 'tblId': 'DT_1B040M1',
    #     'prdSe': 'M',   'newEstPrdCnt': '1',
    #     'extra': {'objL2': 'ALL', 'objL3': 'ALL', 'itmId': 'ALL'},
    #     'desc':  '읍면동별 주민등록인구',
    # },
    # 향후 추가 예:
    # 'sigun_agri': {'orgId': '101', 'tblId': 'DT_...', 'prdSe': 'Y', 'newEstPrdCnt': '1', 'extra': {}, 'desc': '농가수'},
}


# ─── fetch ────────────────────────────────────────────────────────────────────

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
        **cfg.get('extra', {}),  # 테이블별 추가 파라미터 (objL2, itmId 등)
    }
    print(f"  [{table_key}] {cfg['desc']} 호출 중…", end=' ', flush=True)
    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        r = requests.get(BASE_URL, params=params, timeout=60, verify=False)
        r.raise_for_status()
        data = r.json()
        # KOSIS 에러 응답 감지 {'err': '999'} 등
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
    """문자열→정수 변환. 실패 시 0."""
    try:
        return int(str(v).replace(',', '').strip())
    except (ValueError, TypeError):
        return 0

def _to_float(v) -> float:
    """문자열→실수 변환. 실패 시 0.0."""
    try:
        return float(str(v).replace(',', '').strip())
    except (ValueError, TypeError):
        return 0.0

def _extract_code(row: dict, n_digits: int):
    """
    행(dict)에서 경기도 코드(41 시작 + n자리)를 추출.
    C1→C4 순서로 검색. 없으면 None.
    """
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


# ─── 파서 ─────────────────────────────────────────────────────────────────────

def parse_sigun_pop(rows: list) -> dict:
    """
    DT_1B040A3 파싱
    반환: {city_id: {population, households, _period}}
    """
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:6]} }")

    # 총인구 / 세대수 ITM_ID 휴리스틱 탐색
    pop_id = hh_id = None
    for iid, nm in itm_ids.items():
        if pop_id is None and any(kw in nm for kw in ('총인구', '인구수', '총 인구', '합계', '계')):
            pop_id = iid
        if hh_id is None and any(kw in nm for kw in ('세대', '가구')):
            hh_id = iid
    # fallback: 첫 ITM_ID를 인구로 간주
    if pop_id is None and itm_ids:
        pop_id = next(iter(itm_ids))
        print(f"    [WARN] 총인구 ITM_ID 자동 탐색 실패 → '{pop_id}' ({itm_ids[pop_id]}) 사용")

    result = {}
    period = ''
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        city_id = CODE_TO_CITY[code5]
        iid  = str(r.get('ITM_ID', '')).strip()
        val  = _to_int(r.get('DT', 0))
        period = str(r.get('PRD_DE', period))
        if city_id not in result:
            result[city_id] = {'_period': period}
        if iid == pop_id and val > 0:
            result[city_id]['population'] = val
        if hh_id and iid == hh_id and val > 0:
            result[city_id]['households'] = val

    return result


def parse_sigun_hh(rows: list) -> dict:
    """
    DT_1B040B3 파싱 — 시군구별 주민등록세대수
    반환: {city_id: {households, _period}}
    ITM_ID = 'T1' (세대수)
    """
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: {itm_ids}")

    hh_id = None
    for iid, nm in itm_ids.items():
        if hh_id is None and any(kw in nm for kw in ('세대', '가구')):
            hh_id = iid
    if hh_id is None and itm_ids:
        hh_id = next(iter(itm_ids))

    result = {}
    period = ''
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        city_id = CODE_TO_CITY[code5]
        iid  = str(r.get('ITM_ID', '')).strip()
        val  = _to_int(r.get('DT', 0))
        period = str(r.get('PRD_DE', period))
        if city_id not in result:
            result[city_id] = {'_period': period}
        if iid == hh_id and val > 0:
            result[city_id]['households'] = val

    return result


def parse_sigun_age(rows: list) -> dict:
    """
    DT_1IN1502 파싱
    반환: {city_id: {senior_count, youth_count, total_count, _period}}
    * 비율 계산은 merge_all()에서 sigun_pop 총인구 기반으로 수행
    """
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:10]} }")

    senior_id = youth_id = total_id = None
    for iid, nm in itm_ids.items():
        if senior_id is None and any(kw in nm for kw in ('65', '노년', '고령', '노인')):
            senior_id = iid
        if youth_id is None and any(kw in nm for kw in ('0~14', '0-14', '유년', '소년')):
            youth_id = iid
        if total_id is None and any(kw in nm for kw in ('총인구', '합계', '전체')):
            total_id = iid

    raw = {}
    period = ''
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        city_id = CODE_TO_CITY[code5]
        iid  = str(r.get('ITM_ID', '')).strip()
        period = str(r.get('PRD_DE', period))
        if city_id not in raw:
            raw[city_id] = {'senior_count': 0, 'youth_count': 0, 'total_count': 0, '_period': period}
        # 수치가 소수점 있으면 float, 아니면 int
        raw_val = str(r.get('DT', '')).strip()
        val = _to_float(raw_val) if '.' in raw_val else _to_int(raw_val)
        if val <= 0:
            continue
        if senior_id and iid == senior_id:
            raw[city_id]['senior_count'] = val
        if youth_id and iid == youth_id:
            raw[city_id]['youth_count'] = val
        if total_id and iid == total_id:
            raw[city_id]['total_count'] = val

    return raw


def parse_sigun_biz(rows: list) -> dict:
    """
    DT_1K52001 파싱
    반환: {city_id: {businesses, workers, _period}}
    산업분류가 여러 행 → 시군별로 합산 (전산업 합계 취득)
    """
    itm_ids = _discover_itm_ids(rows)
    print(f"    ITM_IDs: { {k: v for k, v in list(itm_ids.items())[:8]} }")

    biz_id = worker_id = None
    for iid, nm in itm_ids.items():
        if biz_id is None and any(kw in nm for kw in ('사업체', '업체 수', '사업체수')):
            biz_id = iid
        if worker_id is None and any(kw in nm for kw in ('종사자', '근로자', '고용')):
            worker_id = iid
    if biz_id is None and itm_ids:
        biz_id = next(iter(itm_ids))
        print(f"    [WARN] 사업체수 ITM_ID 자동 탐색 실패 → '{biz_id}' ({itm_ids[biz_id]}) 사용")

    # 시군별 집계 (산업분류별 행이 여러 개이면 합산 — 전산업 합계 근사)
    result = {}
    period = ''
    for r in rows:
        code5 = _extract_code(r, 5)
        if not code5 or code5 not in CODE_TO_CITY:
            continue
        city_id = CODE_TO_CITY[code5]
        iid  = str(r.get('ITM_ID', '')).strip()
        val  = _to_int(r.get('DT', 0))
        period = str(r.get('PRD_DE', period))
        if city_id not in result:
            result[city_id] = {'businesses': 0, 'workers': 0, '_period': period}
        if iid == biz_id and val > 0:
            # 중복 합산 방지: 이미 0인 경우만 set (더 큰 값 = 합계 행 우선)
            if val > result[city_id]['businesses']:
                result[city_id]['businesses'] = val
        if worker_id and iid == worker_id and val > 0:
            if val > result[city_id]['workers']:
                result[city_id]['workers'] = val

    # 0인 항목 제거
    for city_id in list(result.keys()):
        if result[city_id]['businesses'] == 0:
            del result[city_id]

    return result


# ─── 병합 ─────────────────────────────────────────────────────────────────────

def merge_all(parsed: dict) -> dict:
    """파서 결과를 region-meta.json 스키마로 병합."""
    sigun  = {cid: {} for cid in SIGUN_CODES}
    dong   = {}   # 현재 API 제약으로 비어 있음 (읍면동 mock 사용)
    tables = {}

    # ── sigun_pop (총인구수) ──
    if 'sigun_pop' in parsed:
        d = parsed['sigun_pop']
        for cid, vals in d.items():
            if 'population' in vals:
                sigun[cid]['population'] = vals['population']
        sample_period = next((v['_period'] for v in d.values() if '_period' in v), '')
        count = sum(1 for v in d.values() if 'population' in v)
        tables['sigun_pop'] = {'tblId': TABLES['sigun_pop']['tblId'], 'period': sample_period,
                               'count': count, 'status': 'ok'}
    else:
        tables['sigun_pop'] = {'status': 'failed'}

    # ── sigun_hh (세대수) ──
    if 'sigun_hh' in parsed:
        d = parsed['sigun_hh']
        for cid, vals in d.items():
            if 'households' in vals:
                sigun[cid]['households'] = vals['households']
        sample_period = next((v['_period'] for v in d.values() if '_period' in v), '')
        count = sum(1 for v in d.values() if 'households' in v)
        tables['sigun_hh'] = {'tblId': TABLES['sigun_hh']['tblId'], 'period': sample_period,
                              'count': count, 'status': 'ok'}
    else:
        tables['sigun_hh'] = {'status': 'failed'}

    # ── 향후 추가 테이블들 (sigun_age, sigun_biz, dong_pop) ──
    # TABLES에 활성화되면 자동으로 처리되도록 범용 병합 루프 추가 가능
    # 현재는 비활성 상태 (주석 해제 시 이 merge_all 도 함께 업데이트 필요)

    return {
        '_meta': {
            'source':     'kosis_api',
            'fetched_at': datetime.now().isoformat(),
            'tables':     tables,
            'coverage': {
                'sigun': sum(1 for d in sigun.values() if d),
                'dong':  len(dong),
            },
            'note': '읍면동 인구·연령·사업체 통계: KOSIS API 파라미터 미확인으로 현재 제외. TABLES dict 활성화 후 재실행 가능.',
        },
        'sigun': sigun,
        'dong':  dong,
    }


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def fetch_all() -> dict:
    if not API_KEY:
        print('[WARN] KOSIS_API_KEY 환경변수 미설정 — placeholder JSON 생성')
        return {
            '_meta': {
                'source': 'placeholder',
                'note': 'KOSIS API 키 없음. $env:KOSIS_API_KEY 설정 후 재실행.',
            },
            'sigun': {cid: {} for cid in SIGUN_CODES},
            'dong': {},
        }

    print('=== KOSIS Open API 수집 시작 ===\n')

    # TABLES dict 에 등록된 키와 매핑 (새 테이블 추가 시 여기도 추가)
    PARSERS = {
        'sigun_pop': parse_sigun_pop,
        'sigun_hh':  parse_sigun_hh,
        # 'dong_pop':  parse_dong_pop,   # 비활성 — TABLES에 활성화되면 주석 해제
        # 'sigun_age': parse_sigun_age,  # 비활성 — 동상
        # 'sigun_biz': parse_sigun_biz,  # 비활성 — 동상
    }

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

    result = merge_all(parsed)

    # 커버리지 리포트
    print('=== Coverage 리포트 ===')
    for tbl, s in result['_meta']['tables'].items():
        cfg = TABLES.get(tbl, {})
        if s.get('status') == 'ok':
            print(f"  ✅ [{tbl}] {s.get('count', 0)}개 시군, 기준: {s.get('period', '?')} | {cfg.get('desc','')} ({s.get('tblId', '')})")
        else:
            print(f"  ❌ [{tbl}] 실패 — tblId 또는 orgId 재확인 필요")
    print(f"  시군 KOSIS 연결: {result['_meta']['coverage']['sigun']}/15")
    print(f"  읍면 KOSIS 연결: {result['_meta']['coverage']['dong']}개 (현재 API 제약으로 0 — mock 사용)\n")

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
