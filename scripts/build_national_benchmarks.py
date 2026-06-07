# -*- coding: utf-8 -*-
"""트리거기준_전국농촌지표0607.xlsx -> 전국 농촌 기준 JSON 2종 (재현 가능 빌더).

출력:
  dat/national-rural-standards.json   (시트1 '전국농촌지표_기준' — 비교 기준 표)
  dat/trigger-benchmarks.json         (시트2 '트리거_전국기준반영' — 트리거별 전국기준 매칭)

트리거 id 정규화: xlsx 'T01' -> 코드 'TC-01' (namyangju-triggers.json 과 매칭).
실행:
  python scripts/build_national_benchmarks.py \
      --xlsx "../0607작업/트리거기준_전국농촌지표0607.xlsx" \
      --outdir dat
결정론적: 동일 입력 -> 동일 출력.
"""
import argparse, json, os, re
import openpyxl


def clean(v):
    if v is None:
        return ""
    s = str(v).strip()
    return s


def num_or_str(v):
    """숫자로 깔끔히 떨어지면 number, 아니면 원문 문자열."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        # 정수면 int
        return int(v) if float(v).is_integer() else float(v)
    s = str(v).strip()
    if s == "":
        return None
    if re.fullmatch(r"-?\d+(\.\d+)?", s):
        f = float(s)
        return int(f) if f.is_integer() else f
    return s


def norm_trigger_id(tid):
    """'T01' -> 'TC-01' ; 'TC-01' 그대로 ; 'T1' -> 'TC-01'."""
    s = clean(tid).upper()
    m = re.match(r"^TC?-?\s*(\d+)$", s)
    if not m:
        return s
    return "TC-" + m.group(1).zfill(2)


def rows_as_dicts(ws):
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], []
    header = [clean(h) for h in rows[0]]
    out = []
    for r in rows[1:]:
        cells = list(r) + [None] * (len(header) - len(r))
        if not any(clean(c) for c in cells):
            continue
        out.append(cells)
    return header, out


def build_standards(ws):
    header, rows = rows_as_dicts(ws)
    H = {name: i for i, name in enumerate(header)}

    def g(cells, name):
        i = H.get(name)
        return cells[i] if i is not None and i < len(cells) else None

    items = []
    for cells in rows:
        items.append({
            "group": clean(g(cells, "기준군")),
            "sector": clean(g(cells, "부문")),
            "indicator": clean(g(cells, "서비스/지표")),
            "content": clean(g(cells, "국가 기준 또는 전국 농촌 지표 내용")),
            "target": num_or_str(g(cells, "목표값")),
            "unit": clean(g(cells, "단위")),
            "direction": clean(g(cells, "방향")),
            "national_value": num_or_str(g(cells, "2024/최근 전국값")),
            "national_unit": clean(g(cells, "전국값 단위")),
            "status": clean(g(cells, "달성여부/해석")),
            "dashboard_link": clean(g(cells, "대시보드 연계")),
            "trigger_apply": clean(g(cells, "트리거 반영 방식")),
            "source": clean(g(cells, "출처자료")),
            "source_org": clean(g(cells, "출처기관")),
            "year": clean(g(cells, "기준연도")),
            "url": clean(g(cells, "출처URL")),
            "note": clean(g(cells, "비고")),
        })
    return {
        "_meta": {
            "purpose": "남양주 지표를 평가할 때 비교 기준으로 쓰는 전국 농촌 기준표 (교수 0602 피드백 #5: 임계값 객관화).",
            "source": "트리거기준_전국농촌지표0607.xlsx · 시트 '전국농촌지표_기준' (한유하)",
            "primary_refs": [
                "2024 농어촌서비스기준 이행실태 점검·평가 (농림축산식품부)",
                "제5차(2025~2029) 농어업인 삶의 질 향상 기본계획",
                "2023 농어업인 등에 대한 복지실태조사 (농촌진흥청)",
            ],
            "count": len(items),
        },
        "items": items,
    }


def build_trigger_benchmarks(ws):
    header, rows = rows_as_dicts(ws)
    H = {name: i for i, name in enumerate(header)}

    def g(cells, name):
        i = H.get(name)
        return cells[i] if i is not None and i < len(cells) else None

    by_id = {}
    order = []
    for cells in rows:
        tid = norm_trigger_id(g(cells, "trigger_id"))
        if not tid:
            continue
        by_id[tid] = {
            "trigger_id": tid,
            "name": clean(g(cells, "트리거명")),
            "base_cond": clean(g(cells, "기존 주요 조건")),
            "national_cond": clean(g(cells, "전국농촌 비교 기준으로 보완한 조건")),
            "benchmark": num_or_str(g(cells, "비교기준값")),
            "unit": clean(g(cells, "단위")),
            "source_type": clean(g(cells, "기준 출처 유형")),
            "source": clean(g(cells, "출처자료")),
            "url": clean(g(cells, "출처URL")),
            "implementation": clean(g(cells, "대시보드 산식/구현 방식")),
            "interpretation": clean(g(cells, "자동해석 문구 예시")),
            "level": clean(g(cells, "반영 수준")),
            "caution": clean(g(cells, "주의사항")),
        }
        order.append(tid)
    return {
        "_meta": {
            "purpose": "대시보드 15개 트리거(TC-01~TC-15) 각각에 전국 농촌 기준을 매칭. id는 TC-0N로 정규화(xlsx T0N).",
            "source": "트리거기준_전국농촌지표0607.xlsx · 시트 '트리거_전국기준반영' (한유하)",
            "levels": {
                "직접 반영": "전국 기준과 비교 구조가 비교적 잘 맞음(정량 비교)",
                "보조 반영": "직접 비교는 어렵지만 판단을 보완",
                "해석 반영": "정량보다 해석 방향 참고(남양주 읍면 평균 병행)",
                "정성 반영": "수치보다 정책 방향 근거",
                "부분 반영": "일부 항목만 전국 기준과 연결",
                "추가 조사 필요": "현재 기준표만으로 부족, 추가 공공통계 필요",
            },
            "order": order,
        },
        "triggers": by_id,
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    web = os.path.dirname(here)
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default=os.path.join(web, "..", "0607작업", "트리거기준_전국농촌지표0607.xlsx"))
    ap.add_argument("--outdir", default=os.path.join(web, "dat"))
    args = ap.parse_args()

    wb = openpyxl.load_workbook(args.xlsx, data_only=True)
    ws1 = wb["전국농촌지표_기준"]
    ws2 = wb["트리거_전국기준반영"]

    std = build_standards(ws1)
    trig = build_trigger_benchmarks(ws2)

    os.makedirs(args.outdir, exist_ok=True)
    p1 = os.path.join(args.outdir, "national-rural-standards.json")
    p2 = os.path.join(args.outdir, "trigger-benchmarks.json")
    with open(p1, "w", encoding="utf-8") as f:
        json.dump(std, f, ensure_ascii=False, indent=2)
    with open(p2, "w", encoding="utf-8") as f:
        json.dump(trig, f, ensure_ascii=False, indent=2)
    print("WROTE", p1, "(items:", std["_meta"]["count"], ")")
    print("WROTE", p2, "(triggers:", len(trig["triggers"]), "->", ", ".join(trig["_meta"]["order"]), ")")


if __name__ == "__main__":
    main()
