# LLM 해석 프록시 (Cloudflare Worker)

정적 GitHub Pages 대시보드는 비밀키를 둘 수 없다. 이 Worker가 **MindLogic UOS Gateway
API 키를 보관**하고 게이트웨이를 대신 호출한다. 대시보드는 키 없이 구조화된 지역
컨텍스트만 보내고, Worker가 프롬프트 조립·호출·JSON 파싱 후 표준 스키마로 돌려준다.

```
대시보드(GitHub Pages) ──POST /interpret {scope,regionId,context}──▶ Worker(키 보관)
                                                                       │
                                              MindLogic Gateway ◀──────┘ Authorization: Bearer
대시보드 ◀── {headline,strengths,weaknesses,policy_recommendation,vision_comment,priority_actions}
```

## ⚠️ 키 취급 (절대 커밋 금지)
키는 **두 곳에만** 둔다:
- 배포: `wrangler secret put MINDLOGIC_API_KEY`
- 로컬: `worker/.dev.vars` (이미 `.gitignore` 처리됨 — `MINDLOGIC_API_KEY=...` 한 줄)

`wrangler.toml`·`src/index.js`·`config.js` 등 커밋되는 파일에는 키를 절대 넣지 않는다.

## 로컬 실행
```bash
cd worker
npm i -g wrangler            # 최초 1회
# worker/.dev.vars 에 MINDLOGIC_API_KEY=... 준비 (gitignore됨)
wrangler dev                 # → http://localhost:8787
```
그다음 `Web/js/config.js` 의 `LLM_PROXY_URL`을 `http://localhost:8787` 로 두고
대시보드(`python -m http.server 8765 --directory Web`)에서 테스트.

## 배포
```bash
cd worker
wrangler secret put MINDLOGIC_API_KEY   # 프롬프트에 키 붙여넣기 (저장 후 노출 안 됨)
wrangler deploy                          # → https://rural-dashboard-llm.<account>.workers.dev
```
배포 후 `Web/js/config.js` 의 `LLM_PROXY_URL` 을 그 워커 URL로 교체하고 커밋.
(워커 URL은 공개값이라 커밋해도 무방. 비밀은 키뿐이며 Worker secret에만 있음.)

## 설정 (src/index.js 상단 상수)
- `MODEL` — 기본 `claude-sonnet-4-6` (게이트웨이 제공 모델 중 안정적. `claude-haiku-*`는 현재 미provision).
- `MAX_TOKENS` / `TEMPERATURE`
- `ALLOWED_ORIGINS` — 허용 Origin 목록(배포 도메인·localhost). 그 외 Origin은 403.
- `GATEWAY_URL` — ⚠️ 경로 끝 슬래시 없음(`/chat/completions`). 슬래시 붙이면 500.

## API
`POST /interpret`
```json
{ "scope": "sigun" | "eup", "regionId": "조안면",
  "context": { "indicators":[{"key","label","value","unit","source"}],
               "vision":{"overall","axes":{"T","H","E"},"potentialFelt":{"potential","felt"}},
               "triggers":["복합 쇠퇴 경보", ...], "insights":[...],
               "type":"...", "scores":{"samlter","ilter","shimter"},
               "seedStrengths":[...], "seedWeaknesses":[...] } }
```
응답:
```json
{ "headline":"", "strengths":[], "weaknesses":[], "policy_recommendation":"",
  "vision_comment":"", "priority_actions":[], "_model":"", "_usage":{} }
```
