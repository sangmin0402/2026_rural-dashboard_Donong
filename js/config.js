/**
 * 클라이언트 설정 — 비밀 아님 (커밋 OK).
 *
 * LLM_PROXY_URL: 실시간 AI 해석을 처리하는 Cloudflare Worker 주소.
 *   - 로컬 테스트:  'http://localhost:8787'  (wrangler dev)
 *   - 배포:        'https://rural-dashboard-llm.<account>.workers.dev'
 *   - 빈 문자열(''): LLM 기능 자동 비활성 → 정적 AI 해석 카드로 폴백.
 *
 * ⚠️ API 키는 여기에 절대 넣지 않는다. 키는 Worker(서버)에만 존재한다.
 */
window.LLM_PROXY_URL = 'https://rural-dashboard-llm.dgh05221.workers.dev';
