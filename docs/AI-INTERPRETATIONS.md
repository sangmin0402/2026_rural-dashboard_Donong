# AI 해석 텍스트 관리 가이드 (5/18 피드백 #5)

> 본 문서는 `dat/ai-interpretations.json` 에 들어가는 사전 작성 텍스트를 어떻게 추가·수정·검수하는지 정리한다.

---

## 1. 왜 사전 작성 텍스트인가

5/18 피드백 #5는 "AI 해석·분석 기능"을 요구했으나, 현재 프로젝트는 **정적 HTML**이며 LLM 실시간 호출을 위한 백엔드(Cloudflare Workers / Vercel Functions 등)가 아직 없다.

**중간 단계 전략**:
- 보고서·인터뷰·현장조사 자료를 기반으로 시군별 해석을 **사람이 사전 작성**
- UI에서 "💡 AI 해석" 카드로 노출하되 **"사전 작성" 배지 + 푸터 안내**로 LLM 실시간 분석이 아님을 명시
- 추후 LLM 서버리스 연동 시 같은 카드 자리에 동적 응답을 그대로 주입할 수 있게 설계

---

## 2. 파일 위치·스키마

`dat/ai-interpretations.json` 단일 파일.

```jsonc
{
  "_meta": {
    "version": "2026-05-18",
    "purpose": "...",
    "scope": "by_zone (5) + by_city (15) + by_indicator_tier",
    "disclaimer": "본 해석은 사전 작성된 가이드입니다. 실시간 LLM 분석이 아닙니다.",
    "future_work": "Cloudflare Workers / Vercel Functions 등 서버리스 LLM 연동 시 동적 해석으로 대체 예정"
  },

  "by_zone": {
    "north-border": {           // 5권역 (CITY_ZONE 의 값과 동일)
      "label": "경계도시형 (북부)",
      "summary": "지역 일반론 한 문장",
      "strengths":  ["...", "..."],
      "weaknesses": ["...", "..."],
      "policy_direction": "권역 단위 권고"
    },
    // ... 5개
  },

  "by_city": {
    "namyangju": {              // 15시군 (CITIES 의 키와 동일)
      "name": "남양주시",
      "headline": "한 문장 요약 — 헤드라인",
      "strengths":  ["...", "...", "..."],   // 3개 권장
      "weaknesses": ["...", "...", "..."],   // 3개 권장
      "policy_recommendation": "정책 권고 문장"
    },
    // ... 15개
  },

  "by_indicator_tier": {
    "L1_high": "...",   // 지표키 (L1, L2, ..., R6) × 등급 (high|mid|low)
    "L1_mid":  "...",
    "L1_low":  "...",
    "L2_high": "...",
    // ... (모든 조합이 필요한 것은 아님 — 있을 때만 표시됨)
  }
}
```

### 키 명명 규칙

- **권역 키** (`by_zone`): `CITY_ZONE` (`app.js`) 의 값과 정확히 일치. 현재 5개: `north-border`, `south-farm`, `west-coast`, `east-mountain`, `urban-edge`.
- **시군 키** (`by_city`): `CITIES` 객체의 ID (영문 소문자). 예: `namyangju`, `gapyeong`, `dongducheon`.
- **지표×등급 키** (`by_indicator_tier`): `{지표키}_{tier}` 형식. 지표키는 `L1`, `L2`, …, `R6`. tier는 `high`/`mid`/`low` (5분위 1~2등급=high, 3등급=mid, 4~5등급=low — `classifyIndicatorTier` 참조). `higherBetter: false` 지표는 자동으로 반전된다.

---

## 3. 어디에 표시되는가

### A. 시군 패널 — `renderAiInterpretationCard(cityId)` (`js/app.js`)
- **헤드라인**: `by_city[cityId].headline` 또는 `by_zone[zone].summary` (fallback)
- **2-column**: `strengths` / `weaknesses`
- **정책 박스**: `policy_recommendation` 또는 `policy_direction`
- 배지: "사전 작성"
- 푸터: `_meta.future_work`

### B. 향후 활용 가능 — `by_indicator_tier`
- `getAiInterpretation(cityId, indicatorKey)` 의 3번째 반환 필드(`indicatorTier`)로 노출
- 현재는 UI에서 미사용 (Commit 7 기준 데이터만 적재)
- 지표 탐색 페이지에서 시군 행을 클릭했을 때 미니 해석을 보여주는 후속 작업의 데이터 소스

---

## 4. 텍스트 작성 가이드

### 권장 길이·톤
- **headline**: 한 문장, 80자 이내. 시군의 정체성을 한 줄로.
- **summary** (zone): 2~3문장. 권역 전반의 구조적 특성.
- **strengths/weaknesses**: 3개씩, 각 1문장. 구체적 자원·과제명을 포함.
- **policy_recommendation**: 1문장 (쉼표·플러스로 3~5개 정책 묶음).
- **by_indicator_tier**: 2~3문장. "정량 → 해석 → 다음 행동" 순서.

### 작성 원칙
1. **숫자만 다시 말하지 말 것** — "인구가 늘어났습니다" ✗ / "정주환경·일자리·교육이 함께 성장 중인지 검증해야 한다" ✓
2. **구체적 지명·자원명 사용** — "수변자원" ✗ / "팔당호·북한강" ✓
3. **권고는 행동 가능한 형태** — "활성화 필요" ✗ / "친환경 인증 비용 보조 + 학습공동체 형성" ✓
4. **사실 검증** — 출처 미상의 단정 금지. 보고서·통계로 확인되지 않는 단정은 피하고 "잠재력이 있다"·"검토 필요" 등 보수적 표현 사용.

### 체크리스트
- [ ] 시군 이름·자원이 정확한가 (예: 가평 = 청평호, 양평 = 두물머리)
- [ ] 권역 분류와 모순되지 않는가
- [ ] 해당 시군의 정책 자료(시 종합계획·농촌협약)와 충돌하지 않는가
- [ ] 비방·차별·정치적 평가는 없는가
- [ ] 한 시군에 대해 강점·약점·권고가 서로 일관되는가

---

## 5. 추가·수정 흐름

### 5-1. 새 시군 텍스트 추가
1. `dat/ai-interpretations.json` 의 `by_city` 에 새 키 추가
2. `version` 을 변경일 기준으로 갱신 (예: `"2026-05-18"` → `"2026-06-01"`)
3. 로컬에서 해당 시군 클릭 → AI 해석 카드 표시 확인
4. PR 또는 commit (메시지에 "AI interp: 시군명 추가" 명시)

### 5-2. 기존 텍스트 수정
1. JSON 직접 편집
2. `version` 갱신
3. 같은 시군 카드 재확인 (브라우저 캐시 새로고침: Ctrl+Shift+R)

### 5-3. 지표×등급 텍스트 추가
- `by_indicator_tier` 에 `{지표키}_{tier}` 키 추가
- 모든 27개 조합(11지표 × 3등급)이 필요한 것은 아님 — 누락된 키는 UI에서 그 줄을 표시하지 않음

---

## 6. 향후 LLM 동적 연동 시 마이그레이션 계획

현재 정적 텍스트 → 서버리스 LLM 호출로 전환할 때 다음만 바꾸면 된다:

```js
// js/app.js — renderAiInterpretationCard 의 데이터 로딩 부분

// AS-IS (정적)
const data = getAiInterpretation(cityId);

// TO-BE (동적)
const data = await fetch(`/api/ai-interpret/${cityId}`)
  .then(r => r.ok ? r.json() : null);
```

서버 측 응답 형식은 본 JSON 스키마와 같게 유지:
```json
{ "city": { "name": ..., "headline": ..., "strengths": [...], "weaknesses": [...], "policy_recommendation": ... },
  "zone": { ... },
  "indicatorTier": "..." }
```

이렇게 하면 UI 렌더링 코드(`renderAiInterpretationCard`) 변경 없이 백엔드만 추가하면 된다. JSON 파일은 LLM 응답의 **fallback 캐시**로 계속 활용할 수 있다.

---

## 7. 현재 적재 현황 (2026-05-18)

- `by_zone`: 5/5
- `by_city`: 15/15 (모든 경기도 농촌 시군 — 보고서·인터뷰 기반)
- `by_indicator_tier`: 27개 (L1·L2·L3·L4 × 3등급 일부, W1·W2·W3·W6·W7 × 3등급 일부, R3·R4·R5·R6 × 3등급 일부)

향후 보고서·현장조사 추가 시 확장 예정.
