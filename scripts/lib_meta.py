#!/usr/bin/env python3
"""
공통 모듈 — region-meta.json 의 3-layer 스키마 관리 + 산식 계산.

`fetch_kosis.py`, `fetch_sgis.py` 양쪽에서 import해 사용.

== 핵심 함수 ==
  load_full_meta()           : 기존 region-meta.json 전체 로드 (raw/computed/manual 모두)
  save_meta(data)            : region-meta.json 저장
  compute_indicators(raw)    : raw 데이터로부터 산식 기반 지표 계산
  merge_raw_by_source(...)   : 새 raw 필드 병합 (다른 source 의 raw는 보존)
  empty_sigun_layer()        : 시군 1개의 빈 3-layer 구조

== 핵심 상수 ==
  SIGUN_CODES, CODE_TO_CITY  : 경기도 15개 시군 코드 매핑
"""

import os, sys, json
from pathlib import Path
from datetime import datetime

# Windows 콘솔 한글 출력
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass


# ─── 경기도 15개 시군 코드 ────────────────────────────────────────────────

SIGUN_CODES = {
    'pyeongtaek':  '41220', 'namyangju':   '41360', 'yongin':      '41460',
    'icheon':      '41500', 'anseong':     '41550', 'hwaseong':    '41590',
    'gwangju':     '41610', 'yangju':      '41630', 'pocheon':     '41650',
    'yeoju':       '41670', 'gapyeong':    '41820', 'yangpyeong':  '41830',
    'osan':        '41370', 'hanam':       '41450', 'dongducheon': '41250',
}
CODE_TO_CITY = {v: k for k, v in SIGUN_CODES.items()}


# ─── 경로 ─────────────────────────────────────────────────────────────────

OUT_PATH = Path(__file__).parent / '..' / 'dat' / 'region-meta.json'


# ─── 값 변환 헬퍼 ─────────────────────────────────────────────────────────

def to_int(v) -> int:
    try: return int(str(v).replace(',', '').strip())
    except (ValueError, TypeError): return 0

def to_float(v) -> float:
    try: return float(str(v).replace(',', '').strip())
    except (ValueError, TypeError): return 0.0

def to_number(v):
    """문자열 → 적절한 수치 (소수점 있으면 float, 없으면 int)."""
    s = str(v).replace(',', '').strip()
    if not s or s.upper() == 'N/A': return None
    if '.' in s:
        try: return float(s)
        except ValueError: return None
    try: return int(s)
    except ValueError: return None


# ─── 3-layer 빈 구조 ──────────────────────────────────────────────────────

def empty_sigun_layer():
    """시군 1개의 빈 3-layer 구조."""
    return {'raw': {}, 'computed': {}, 'manual': {}}

def empty_full_meta(source_label='placeholder'):
    """전체 region-meta.json 빈 구조."""
    return {
        '_meta': {
            'source':     source_label,
            'fetched_at': datetime.now().isoformat(),
            'schema':     '3-layer (raw / computed / manual)',
            'tables':     {},
            'coverage':   {'sigun': 0, 'dong': 0},
        },
        'sigun': {cid: empty_sigun_layer() for cid in SIGUN_CODES},
        'dong':  {},
    }


# ─── 로드 / 저장 ──────────────────────────────────────────────────────────

def load_full_meta() -> dict:
    """기존 region-meta.json 전체 로드. 없으면 빈 구조."""
    if not OUT_PATH.exists():
        return empty_full_meta()
    try:
        with open(OUT_PATH, encoding='utf-8') as f:
            data = json.load(f)
        # 시군 모두 3-layer 구조 보장 (예전 평탄 구조 마이그레이션)
        if 'sigun' not in data: data['sigun'] = {}
        for cid in SIGUN_CODES:
            if cid not in data['sigun']:
                data['sigun'][cid] = empty_sigun_layer()
            else:
                s = data['sigun'][cid]
                if not isinstance(s, dict): s = empty_sigun_layer()
                s.setdefault('raw', {})
                s.setdefault('computed', {})
                s.setdefault('manual', {})
                data['sigun'][cid] = s
        if 'dong' not in data: data['dong'] = {}
        return data
    except Exception as e:
        print(f"[WARN] region-meta.json 로딩 실패: {e} — 빈 구조로 시작")
        return empty_full_meta()

def save_meta(data: dict) -> None:
    """region-meta.json 저장."""
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    size_kb = OUT_PATH.stat().st_size // 1024
    print(f'[저장] {OUT_PATH} ({size_kb} KB)')


# ─── source-별 raw 병합 (협업 핵심) ───────────────────────────────────────

def merge_raw_by_source(existing: dict, new_raw_by_city: dict, source_prefix: str) -> dict:
    """
    existing region-meta 의 raw 층에 new_raw 를 source-별로 병합.

    파라미터:
      existing        : load_full_meta()로 받은 전체 dict
      new_raw_by_city : {city_id: {field: {value, year, source}}} (이미 raw 형태)
      source_prefix   : 'kosis' 또는 'sgis' — 이 prefix 로 시작하는 기존 raw 만 덮어씀

    동작:
      1. existing.sigun[cid].raw 중 source 가 source_prefix 로 시작하는 필드만 제거
      2. new_raw 의 필드 추가
      → 다른 source 의 raw 필드는 그대로 보존됨
    """
    for cid in SIGUN_CODES:
        if cid not in existing['sigun']:
            existing['sigun'][cid] = empty_sigun_layer()
        raw = existing['sigun'][cid].setdefault('raw', {})
        # 1) 이전 같은 source raw 제거
        to_remove = [k for k, v in raw.items()
                     if isinstance(v, dict) and str(v.get('source', '')).startswith(f'{source_prefix}:')]
        for k in to_remove:
            del raw[k]
        # 2) 새 raw 병합
        if cid in new_raw_by_city:
            for k, rec in new_raw_by_city[cid].items():
                raw[k] = rec
    return existing


# ─── 산식 계산 (computed 층) ──────────────────────────────────────────────

def compute_indicators(raw: dict) -> dict:
    """
    raw 데이터(특정 시군의 raw 층)로부터 산식 기반 지표 계산.
    입력 형식: {field: {'value': ..., 'year': ..., 'source': ...}}
    반환 형식: {indicator_key: {'value': ..., 'unit': ..., 'formula': ..., 'inputs': {...}}}
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

    # ── L2: 노령화지수 — SGIS aging_idx 직접 활용 ──
    aging = get('aging_idx')
    if aging is not None:
        computed['L2_aging_index'] = {
            'value':   float(aging),
            'unit':    '—',
            'formula': '65세이상 인구 / 0-14세 인구 × 100 (SGIS 직접 제공)',
            'inputs':  {'aging_idx_sgis': aging},
        }

    # ── L3: 인구순이동률 = (전입 - 전출) / 인구 × 1000 ──
    inflow  = get('inflow')
    outflow = get('outflow')
    if inflow is not None and outflow is not None and pop and pop > 0:
        computed['L3_net_migration_rate'] = {
            'value':   round((inflow - outflow) / pop * 1000, 2),
            'unit':    '‰',
            'formula': '(전입 - 전출) / 총인구 × 1000',
            'inputs':  {'inflow': inflow, 'outflow': outflow, 'population': pop},
        }

    # ── W2: 사업체수 (SGIS corp_cnt 직접) ──
    corp = get('corp_cnt')
    if corp is not None:
        computed['W2_business_count'] = {
            'value':   corp,
            'unit':    '개',
            'formula': 'SGIS 사업체 통계 (전산업 합계)',
            'inputs':  {'corp_cnt': corp},
        }

    # ── W8: 서비스판매 종사자 (도소매 + 숙박음식 합산) ──
    w_g = get('wholesale_tot_worker')
    w_i = get('hospitality_tot_worker')
    if w_g is not None or w_i is not None:
        total = (w_g or 0) + (w_i or 0)
        if total > 0:
            computed['W8_service_sales_workers'] = {
                'value':   total,
                'unit':    '명',
                'formula': '도소매(G) 종사자 + 숙박음식(I) 종사자',
                'inputs':  {'wholesale_workers': w_g, 'hospitality_workers': w_i},
            }

    return computed


def recompute_all(data: dict) -> None:
    """전체 시군의 computed 층 재계산 (in-place)."""
    for cid in data.get('sigun', {}):
        sigun = data['sigun'][cid]
        if isinstance(sigun, dict):
            sigun['computed'] = compute_indicators(sigun.get('raw', {}))
