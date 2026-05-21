"""
남양주시 읍면동 가상 데이터 생성기 (피드백 #7 — 현장 데이터는 가상 데이터로 먼저 테스트)
============================================================================

목적
----
남양주시 16개 읍·면·동(읍6 + 면3 + 동7)에 대해 농촌다움 핵심 지표 9개의 결정론적 가상값을
생성한다. 실제 KOSIS/SGIS 읍면동 단위 마이크로데이터 수집 전 단계에서 UI 테스트,
시각화 디자인 검증, 시뮬레이션 기능 점검에 사용한다.

결정론적
--------
- seed = 'namyangju-2026-feedback-0518'
- 동일한 seed + adm_cd 입력 → 항상 동일한 출력
- 따라서 결과 JSON을 그대로 commit 해도 무방하다 (CI에서 재생성 가능)

특성 매트릭스
-------------
읍·면·동은 도시-농촌 스펙트럼에서 위치가 다르며, 그에 따라 지표 분포의 평균이 다르다.
편의를 위해 3개 클러스터로 분류한다.
  - 도심형 (urban):  다산1동·다산2동·별내동·호평동·평내동·금곡동·양정동
  - 전이형 (transit): 와부읍·화도읍·진접읍·진건읍·오남읍·퇴계원읍
  - 농촌형 (rural):  별내면·수동면·조안면

지표 9개
--------
  L1_pop_growth        — 인구증가율 (도시>전이>농촌, 단위 %)
  L4_living_soc        — 생활SOC 충족지수 (도시>전이>농촌, 0~100)
  W2_business_density  — 사업체 밀도 (개/㎢)
  W6_young_return      — 청년 귀농 유입 비율 (농촌>전이>도시, %)
  W7_eco_farm          — 친환경 인증 농가 비율 (농촌>전이>도시, %)
  R3_green_ratio       — 녹지율 (농촌>전이>도시, %)
  R4_experience_prog   — 농촌체험 프로그램 (건/천명)
  R5_water_quality     — 양호수질 하천 비율 (%)
  R6_park_per_capita   — 수변·생태쉼터 면적 (㎡/천명)

출력
----
  dat/simulation/namyangju-dong-mock.json

스키마
------
  {
    "_meta": { "version": "...", "seed": "...", "generated_at": "...",
               "scope": "namyangju", "purpose": "..." },
    "dongs": {
      "31130110": {
        "adm_nm": "와부읍",
        "cluster": "transit",
        "indicators": {
          "L1_pop_growth": { "value": 0.34, "unit": "%", "source": "simulation:namyangju-mock" },
          ...
        }
      },
      ...
    }
  }

실행
----
  python scripts/generate_mock_dong.py
  → dat/simulation/namyangju-dong-mock.json 갱신
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

SEED = "namyangju-2026-feedback-0518"

# 남양주 16개 읍·면·동 (gyeonggi-dong.geojson 기준)
NAMYANGJU_DONGS = [
    {"adm_cd": "31130110", "adm_nm": "와부읍",    "cluster": "transit"},
    {"adm_cd": "31130111", "adm_nm": "화도읍",    "cluster": "transit"},
    {"adm_cd": "31130120", "adm_nm": "진접읍",    "cluster": "transit"},
    {"adm_cd": "31130140", "adm_nm": "진건읍",    "cluster": "transit"},
    {"adm_cd": "31130150", "adm_nm": "오남읍",    "cluster": "transit"},
    {"adm_cd": "31130160", "adm_nm": "퇴계원읍",  "cluster": "transit"},
    {"adm_cd": "31130310", "adm_nm": "별내면",    "cluster": "rural"},
    {"adm_cd": "31130340", "adm_nm": "수동면",    "cluster": "rural"},
    {"adm_cd": "31130350", "adm_nm": "조안면",    "cluster": "rural"},
    {"adm_cd": "31130510", "adm_nm": "호평동",    "cluster": "urban"},
    {"adm_cd": "31130520", "adm_nm": "평내동",    "cluster": "urban"},
    {"adm_cd": "31130530", "adm_nm": "금곡동",    "cluster": "urban"},
    {"adm_cd": "31130540", "adm_nm": "양정동",    "cluster": "urban"},
    {"adm_cd": "31130570", "adm_nm": "별내동",    "cluster": "urban"},
    {"adm_cd": "31130580", "adm_nm": "다산1동",   "cluster": "urban"},
    {"adm_cd": "31130590", "adm_nm": "다산2동",   "cluster": "urban"},
]

# 지표 정의: (key, label, unit, cluster_means {urban, transit, rural}, spread)
# cluster_means 은 평균값, spread 는 ±상대편차 (0.0~1.0)
INDICATOR_DEFS = [
    ("L1_pop_growth",       "인구증가율",            "%",         {"urban":  2.6, "transit":  0.4, "rural": -1.8}, 0.55),
    ("L4_living_soc",       "생활SOC 충족지수",      "",          {"urban": 78.0, "transit": 56.0, "rural": 38.0}, 0.20),
    ("W2_business_density", "사업체 밀도",           "개/㎢",     {"urban": 312.0,"transit":  82.0, "rural":  18.0}, 0.35),
    ("W6_young_return",     "청년 귀농 유입 비율",   "%",         {"urban":  0.6, "transit":  2.1, "rural":  4.7}, 0.30),
    ("W7_eco_farm",         "친환경 인증 농가 비율", "%",         {"urban":  1.4, "transit":  6.8, "rural": 16.9}, 0.45),
    ("R3_green_ratio",      "녹지율",                "%",         {"urban": 24.0, "transit": 47.0, "rural": 71.0}, 0.18),
    ("R4_experience_prog",  "농촌체험 프로그램",     "건/천명",   {"urban":  0.05,"transit":  0.18, "rural":  0.46}, 0.35),
    ("R5_water_quality",    "양호수질 하천 비율",    "%",         {"urban": 52.0, "transit": 64.0, "rural": 81.0}, 0.18),
    ("R6_park_per_capita",  "수변·생태쉼터 면적",    "㎡/천명",   {"urban": 4.8,  "transit":  9.5,  "rural": 22.7}, 0.40),
]


def deterministic_unit(seed: str, adm_cd: str, indicator_key: str) -> float:
    """
    seed + 행정코드 + 지표키로 [0,1) 범위의 결정론적 값 생성.
    SHA-256 → 첫 8바이트(uint64) → 2^64 로 나눠 정규화.
    """
    h = hashlib.sha256(f"{seed}|{adm_cd}|{indicator_key}".encode("utf-8")).digest()
    n = int.from_bytes(h[:8], "big")
    return n / (1 << 64)  # [0, 1)


def generate_value(adm_cd: str, cluster: str, key: str, mean: float, spread: float) -> float:
    """
    클러스터 평균을 중심으로 ±spread*mean 범위에서 균일 분포 샘플.
    음수 평균(L1_pop_growth 의 rural) 일 경우 절댓값에 비례한 spread 적용.
    """
    u = deterministic_unit(SEED, adm_cd, key)  # 0~1
    delta = (u - 0.5) * 2.0 * spread * max(abs(mean), 0.5)
    return mean + delta


def round_value(value: float, key: str) -> float:
    """
    지표별 합리적인 소수점 자리로 반올림.
    """
    if key in ("L4_living_soc", "R3_green_ratio", "R5_water_quality"):
        return round(value, 1)
    if key in ("W2_business_density",):
        return round(value, 0)
    if key in ("R6_park_per_capita",):
        return round(value, 1)
    if key in ("R4_experience_prog",):
        return round(value, 3)
    return round(value, 2)


def build_indicator_block(adm_cd: str, cluster: str) -> dict:
    block = {}
    for key, label, unit, means, spread in INDICATOR_DEFS:
        mean = means[cluster]
        v = generate_value(adm_cd, cluster, key, mean, spread)
        block[key] = {
            "value": round_value(v, key),
            "label": label,
            "unit": unit,
            "source": "simulation:namyangju-mock",
        }
    return block


def build_output() -> dict:
    return {
        "_meta": {
            "version": "2026-05-18",
            "seed": SEED,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scope": "namyangju",
            "purpose": (
                "남양주시 읍면동 16개에 대한 농촌다움 9개 지표 가상값. "
                "실제 KOSIS/SGIS 읍면동 마이크로데이터 수집 전 UI·시뮬레이션 테스트 용도. "
                "동일 seed 로 재실행하면 동일 결과가 나온다."
            ),
            "cluster_counts": {
                "urban": sum(1 for d in NAMYANGJU_DONGS if d["cluster"] == "urban"),
                "transit": sum(1 for d in NAMYANGJU_DONGS if d["cluster"] == "transit"),
                "rural": sum(1 for d in NAMYANGJU_DONGS if d["cluster"] == "rural"),
            },
            "dong_count": len(NAMYANGJU_DONGS),
            "indicator_count": len(INDICATOR_DEFS),
        },
        "dongs": {
            d["adm_cd"]: {
                "adm_nm": d["adm_nm"],
                "cluster": d["cluster"],
                "indicators": build_indicator_block(d["adm_cd"], d["cluster"]),
            }
            for d in NAMYANGJU_DONGS
        },
    }


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    out_path = repo_root / "dat" / "simulation" / "namyangju-dong-mock.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    output = build_output()
    out_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[OK] {len(NAMYANGJU_DONGS)} dongs x {len(INDICATOR_DEFS)} indicators → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
