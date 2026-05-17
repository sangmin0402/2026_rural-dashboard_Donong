#!/usr/bin/env python3
"""
KOSIS Open API에서 경기도 15개 시군 + 읍면동 단위 통계를 수집해 region-meta.json 생성.

실행:
  KOSIS_API_KEY=발급받은_키 python fetch_kosis.py

키 발급: https://kosis.kr/openapi/devGuide/devGuide_0101List.do (회원가입 후)

키 없이 실행하면 placeholder JSON을 만들어 (사이트는 정상 동작하되 "예시 데이터" 배지 표기).

출력: ../dat/region-meta.json
"""

import os
import sys
import json
from pathlib import Path

# Windows 콘솔 cp949 환경에서 한글/특수문자 출력 가능하게
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


SIGUN_CODES = {
    'pyeongtaek': '41220', 'namyangju': '41360', 'yongin': '41460',
    'icheon':     '41500', 'anseong':   '41550', 'hwaseong':  '41590',
    'gwangju':    '41610', 'yangju':    '41630', 'pocheon':   '41650',
    'yeoju':      '41670', 'gapyeong':  '41820', 'yangpyeong': '41830',
    'osan':       '41370', 'hanam':     '41450', 'dongducheon':'41250',
}

API_KEY = os.environ.get('KOSIS_API_KEY', '').strip()
BASE = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'
OUT_PATH = Path(__file__).parent / '..' / 'dat' / 'region-meta.json'


def fetch_kosis(orgId, tblId, **kwargs):
    """공통 fetch. KOSIS의 표준 파라미터로 데이터 호출."""
    if not API_KEY:
        return None
    params = {
        'method': 'getList',
        'apiKey': API_KEY,
        'format': 'json',
        'jsonVD': 'Y',
        'orgId': orgId,
        'tblId': tblId,
        **kwargs,
    }
    try:
        r = requests.get(BASE, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        return None
    except Exception as e:
        print(f'  [WARN] KOSIS 호출 실패 ({tblId}): {e}', file=sys.stderr)
        return None


def build_placeholder():
    """API 키 없을 때 — 빈 구조 + 알림 플래그."""
    return {
        '_meta': {
            'source': 'placeholder',
            'note': 'KOSIS API 키 없이 생성된 빈 데이터. fetch_kosis.py 재실행 필요.',
            'kosis_help': 'https://kosis.kr/openapi/',
        },
        'sigun': {cid: {} for cid in SIGUN_CODES},
        'dong': {},
    }


def fetch_all():
    if not API_KEY:
        print('[WARN] KOSIS_API_KEY 환경변수 미설정 — placeholder JSON 생성')
        return build_placeholder()

    print('[1/N] KOSIS 통계 수집 시작')
    result = {
        '_meta': {
            'source': 'kosis_api',
            'fetched_at': __import__('datetime').datetime.now().isoformat(),
        },
        'sigun': {cid: {} for cid in SIGUN_CODES},
        'dong': {},
    }

    # TODO: 실제 KOSIS 통계표 ID 와 파라미터에 맞춰 본격 호출
    # 예시: 주민등록인구 by 시군구
    # 통계표: 행정안전부 / 주민등록인구통계 / 행정구역(시군구)별, 성별 인구수
    # orgId='101', tblId='DT_1B040A3'
    #
    # 실제 호출 시:
    # rows = fetch_kosis('101', 'DT_1B040A3',
    #                    objL1='시군구코드들', prdSe='M', startPrdDe='202504', endPrdDe='202504')
    # for row in rows: ...

    # 현재는 placeholder만 — 사용자가 API 키 발급 후 실제 호출 코드 추가 가능
    print('[NOTE] 실제 KOSIS 호출 코드는 사용자가 발급받은 API 키와 원하는 통계표에 맞춰 채워주세요.')
    print('       (현재는 키 있어도 placeholder만 생성 — 호출 코드 미구현)')

    return result


def main():
    data = fetch_all()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'\n[완료] {OUT_PATH} 저장 ({os.path.getsize(OUT_PATH)} bytes)')


if __name__ == '__main__':
    main()
