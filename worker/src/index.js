/**
 * 농촌다움 대시보드 — LLM 해석 프록시 (Cloudflare Worker)
 *
 * 정적 GitHub Pages는 비밀키를 둘 수 없으므로, 이 Worker가 MindLogic UOS
 * Gateway 키를 보관(env.MINDLOGIC_API_KEY)하고 대신 호출한다.
 * 대시보드는 키 없이 구조화된 지역 컨텍스트만 보내고, Worker가 프롬프트를
 * 조립·호출·JSON 파싱하여 표준 스키마로 돌려준다.
 *
 * 엔드포인트: POST /interpret   body: { scope:'sigun'|'eup', regionId, context }
 * 응답: { headline, strengths[], weaknesses[], policy_recommendation,
 *         vision_comment, priority_actions[] }
 *
 * 키는 절대 코드/응답에 노출하지 않는다. (wrangler secret / .dev.vars)
 */

// MindLogic UOS Gateway (OpenAI 호환). ⚠️ 경로 끝 슬래시 없음(있으면 500).
const GATEWAY_URL = 'https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions';
// 모델: 비용 최소화 위해 gpt-5.4-nano (벤치마크 결과 카드 JSON·챗 모두 정상, 토큰 최소).
// 품질 올리려면 이 한 줄만 교체: gpt-5.4-mini → claude-sonnet-4-6. (haiku는 게이트웨이 500, gemini-flash는 추론토큰 과다.)
const MODEL = 'gpt-5.4-nano';
const MAX_TOKENS = 900;     // 카드(JSON 6키)용
const MAX_TOKENS_ASK = 500; // 챗 답변용 (짧게)
const TEMPERATURE = 0.2;

// 공개 Worker URL 남용 방지 — 허용 Origin만 응답.
const ALLOWED_ORIGINS = [
  'https://sangmin0402.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Not found. POST /interpret 또는 /ask.' }, 404, origin);
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Origin not allowed.' }, 403, origin);
    }
    if (!env.MINDLOGIC_API_KEY) {
      return json({ error: 'Server misconfigured: missing API key.' }, 500, origin);
    }

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: 'Invalid JSON body.' }, 400, origin); }

    if (url.pathname.endsWith('/ask')) {
      return handleAsk(payload, env, origin);
    }
    if (url.pathname.endsWith('/interpret')) {
      return handleInterpret(payload, env, origin);
    }
    return json({ error: 'Not found. POST /interpret 또는 /ask.' }, 404, origin);
  },
};

/** 게이트웨이 호출 공통 (messages → content 문자열) */
async function callGateway(env, messages, maxTokens, origin) {
  let gwResp;
  try {
    gwResp = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.MINDLOGIC_API_KEY}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: TEMPERATURE, messages }),
    });
  } catch (e) {
    return { err: json({ error: 'Gateway 호출 실패', detail: String(e) }, 502, origin) };
  }
  if (!gwResp.ok) {
    const text = await gwResp.text().catch(() => '');
    return { err: json({ error: `Gateway ${gwResp.status}`, detail: text.slice(0, 300) }, 502, origin) };
  }
  let data;
  try { data = await gwResp.json(); }
  catch { return { err: json({ error: 'Gateway 응답 파싱 실패' }, 502, origin) }; }
  return { content: data?.choices?.[0]?.message?.content || '', usage: data.usage || null };
}

/** /interpret — 시군·읍면 해석 카드 (구조화 JSON) */
async function handleInterpret(payload, env, origin) {
  const { scope, regionId, context } = payload || {};
  if (!scope || !regionId || !context) {
    return json({ error: 'scope, regionId, context 필수.' }, 400, origin);
  }
  const messages = buildMessages(scope, regionId, context);
  const r = await callGateway(env, messages, MAX_TOKENS, origin);
  if (r.err) return r.err;

  const parsed = extractJson(r.content);
  if (!parsed) {
    return json({ error: 'LLM JSON 파싱 실패', raw: r.content.slice(0, 400) }, 502, origin);
  }
  return json({
    headline: str(parsed.headline),
    strengths: arr(parsed.strengths),
    weaknesses: arr(parsed.weaknesses),
    policy_recommendation: str(parsed.policy_recommendation),
    vision_comment: str(parsed.vision_comment),
    priority_actions: arr(parsed.priority_actions),
    _model: MODEL,
    _usage: r.usage,
  }, 200, origin);
}

/** /ask — 자유 질의응답 (facts-only, 평문 답변) */
async function handleAsk(payload, env, origin) {
  const { question, context, history } = payload || {};
  if (!question || typeof question !== 'string') {
    return json({ error: 'question 필수.' }, 400, origin);
  }
  const messages = buildAskMessages(question, context || {}, Array.isArray(history) ? history : []);
  const r = await callGateway(env, messages, MAX_TOKENS_ASK, origin);
  if (r.err) return r.err;
  return json({ answer: (r.content || '').trim(), _model: MODEL, _usage: r.usage }, 200, origin);
}

// ── 프롬프트 조립 ──────────────────────────────────────────────
// 공통 facts-only 규칙: 제공된 숫자/근거만 사용, 추측·미사여구 금지.
const FACTS_RULE = '제공된 수치·근거(facts)만 사용하라. facts에 없는 수치·순위·사실은 절대 지어내지 마라. 추측·일반상식 단정·과장된 미사여구를 쓰지 마라.';

function buildMessages(scope, regionId, ctx) {
  const sys = scope === 'eup'
    ? '너는 농촌공간계획 정책 분석가다. 남양주시 민선 8기 비전(THE: T 교통·H 삶의질·E 교육환경)과 제공된 읍면 지표·비전 적합도·발화 트리거를 근거로 해석한다. ' + FACTS_RULE + ' ' +
      '반드시 유효한 JSON 객체 하나만 출력하고 코드펜스/설명 텍스트는 절대 쓰지 마라. ' +
      '키: headline(1문장), strengths(2개 배열), weaknesses(2개 배열), policy_recommendation(1~2문장), vision_comment(비전 적합도를 해석하는 1문장), priority_actions(우선 조치 2개 배열). 모두 한국어, 정책 실무자용. ' +
      '각 배열 항목은 한 문장(60자 이내)으로 간결하게. 전체 JSON은 짧게 유지.'
    : '너는 농촌공간계획 정책 분석가다. 경기도 농촌다움 지표(삶터·일터·쉼터)와 제공된 시군 지표를 근거로 해석한다. ' + FACTS_RULE + ' ' +
      '반드시 유효한 JSON 객체 하나만 출력하고 코드펜스/설명 텍스트는 절대 쓰지 마라. ' +
      '키: headline(1문장), strengths(2~3개 배열), weaknesses(2~3개 배열), policy_recommendation(1~2문장), vision_comment(""), priority_actions([]). 모두 한국어, 간결.';

  const user = scope === 'eup' ? eupUserPrompt(regionId, ctx) : sigunUserPrompt(regionId, ctx);
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

// ── 자유 질의응답(/ask) 프롬프트 ───────────────────────────────
function buildAskMessages(question, context, history) {
  const sys = '너는 "경기도 농촌다움 지표 대시보드"의 데이터 안내자다. 사용자가 지금 보고 있는 화면과 지표에 대해 질문하면 답한다. ' +
    FACTS_RULE + ' 순위·등급·평균 같은 수치는 이미 계산되어 facts로 제공되니 그대로 인용만 하라(직접 계산·추정 금지). ' +
    '정책을 묻는 질문에는, facts의 "준비된 정책"·"2035 비전 달성률" 항목을 우선 근거로 활용해 답하라(그 안에 있으면 그대로 인용·요약, 없으면 제공된 지표 수치 범위에서만 신중히 제안). ' +
    'facts에 없는 질문이면 "현재 화면 데이터로는 알 수 없습니다"라고 솔직히 답하라. 한국어로 2~4문장, 친절하지만 간결하게. 마크다운·목록 없이 문장으로.';

  const msgs = [{ role: 'system', content: sys }];
  // 직전 대화 맥락 (최근 6턴만, 안전 클램프)
  for (const t of (history || []).slice(-6)) {
    if (t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string') {
      msgs.push({ role: t.role, content: t.content.slice(0, 800) });
    }
  }
  const factsText = factsToText(context);
  msgs.push({ role: 'user', content: `[현재 화면 facts]\n${factsText}\n\n[질문] ${question}` });
  return msgs;
}

/** 클라이언트가 보낸 구조화 facts를 읽기 좋은 한국어 블록으로 */
function factsToText(ctx) {
  if (!ctx || typeof ctx !== 'object') return '(facts 없음)';
  const lines = [];
  if (ctx.view) lines.push(`보는 화면: ${ctx.view}`);
  if (ctx.region) lines.push(`대상 지역: ${ctx.region}`);
  if (ctx.scores) lines.push(`종합점수 — 삶터 ${ctx.scores.samlter ?? '-'}, 일터 ${ctx.scores.ilter ?? '-'}, 쉼터 ${ctx.scores.shimter ?? '-'} (100점 만점)`);
  const fmtInd = (f) => {
    if (!f) return null;
    const parts = [`${f.name || f.key}=${f.value ?? '미수집'}${f.unit || ''}`];
    if (f.rank != null && f.total != null) parts.push(`${f.scopeLabel || '전체'} ${f.total}곳 중 ${f.rank}등`);
    if (f.tierLabel) parts.push(`등급: ${f.tierLabel}`);
    if (f.avg != null) parts.push(`평균 ${f.avg}`);
    if (f.max != null) parts.push(`최고 ${f.max}${f.maxRegion ? `(${f.maxRegion})` : ''}`);
    if (f.min != null) parts.push(`최저 ${f.min}${f.minRegion ? `(${f.minRegion})` : ''}`);
    if (f.higherBetter === false) parts.push('(낮을수록 좋음)');
    if (f.source) parts.push(`출처:${f.source}`);
    return '· ' + parts.join(', ');
  };
  if (ctx.focusIndicator) { lines.push('포커스 지표:'); lines.push(fmtInd(ctx.focusIndicator)); }
  if (Array.isArray(ctx.indicators) && ctx.indicators.length) {
    lines.push('관련 지표:');
    ctx.indicators.forEach(f => { const s = fmtInd(f); if (s) lines.push(s); });
  }
  if (ctx.vision) {
    const a = ctx.vision.axes || {};
    lines.push(`비전 적합도: ${ctx.vision.overall ?? '-'}/100 (T ${a.T ?? '-'}, H ${a.H ?? '-'}, E ${a.E ?? '-'})`);
  }
  if (Array.isArray(ctx.triggers) && ctx.triggers.length) lines.push(`발화 트리거: ${ctx.triggers.join(', ')}`);
  if (ctx.vision2035) {
    const v = ctx.vision2035;
    lines.push('2035 비전 달성률(도시기본계획 목표 대비):');
    if (Array.isArray(v.areas) && v.areas.length) lines.push(`· 영역 점수: ${v.areas.join(', ')}`);
    if (Array.isArray(v.low_rate) && v.low_rate.length) lines.push(`· 미달(60%↓): ${v.low_rate.join(', ')}`);
    if (Array.isArray(v.high_rate) && v.high_rate.length) lines.push(`· 양호(80%↑): ${v.high_rate.join(', ')}`);
    if (v.key_insight) lines.push(`· 핵심: ${v.key_insight}`);
  }
  if (Array.isArray(ctx.policies) && ctx.policies.length) {
    lines.push('준비된 정책(프로젝트 작성 — 답변 근거로 우선 활용):');
    ctx.policies.forEach(p => lines.push(`· ${p}`));
  }
  if (Array.isArray(ctx.notes)) ctx.notes.forEach(n => lines.push(String(n)));
  return lines.length ? lines.join('\n') : '(facts 없음)';
}

function fmtIndicators(list) {
  if (!Array.isArray(list)) return '';
  return list.map(i => {
    const v = (i.value == null) ? '미수집' : `${i.value}${i.unit ? i.unit : ''}`;
    const src = i.source ? `[${i.source}]` : '';
    return `${i.label || i.key} ${v}${src}`;
  }).join(', ');
}

function eupUserPrompt(name, ctx) {
  const lines = [`남양주시 ${name} 분석.`];
  if (ctx.indicators) lines.push(`지표: ${fmtIndicators(ctx.indicators)}.`);
  if (ctx.vision) {
    const a = ctx.vision.axes || {};
    lines.push(`민선8기 비전 적합도 ${ctx.vision.overall ?? '-'}/100 (T 교통 ${a.T ?? '-'}, H 삶의질 ${a.H ?? '-'}, E 교육환경 ${a.E ?? '-'}).`);
    if (ctx.vision.potentialFelt) {
      const pf = ctx.vision.potentialFelt;
      lines.push(`자원 잠재력 ${pf.potential ?? '-'} vs 시민 체감 서비스 ${pf.felt ?? '-'}.`);
    }
  }
  if (ctx.triggers && ctx.triggers.length) lines.push(`발화 트리거: ${ctx.triggers.join(', ')}.`);
  if (ctx.insights && ctx.insights.length) lines.push(`도출 시사점: ${ctx.insights.join(', ')}.`);
  lines.push('출처 표기 [field]=현장조사, [sim]=시뮬레이션, [sigun]=시군고정값임을 감안해 신뢰도를 해석에 반영하라.');
  return lines.join(' ');
}

function sigunUserPrompt(name, ctx) {
  const lines = [`경기도 ${name}${ctx.type ? `(${ctx.type})` : ''} 분석.`];
  if (ctx.indicators) lines.push(`지표: ${fmtIndicators(ctx.indicators)}.`);
  if (ctx.scores) lines.push(`종합점수 — 삶터 ${ctx.scores.samlter ?? '-'}, 일터 ${ctx.scores.ilter ?? '-'}, 쉼터 ${ctx.scores.shimter ?? '-'}.`);
  if (ctx.seedStrengths) lines.push(`참고(기존 진단) 강점: ${(ctx.seedStrengths || []).join('; ')}.`);
  if (ctx.seedWeaknesses) lines.push(`참고(기존 진단) 약점: ${(ctx.seedWeaknesses || []).join('; ')}.`);
  return lines.join(' ');
}

// ── 응답 파싱·정규화 헬퍼 ───────────────────────────────────────
function extractJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* noop */ } }
  return null;
}
function str(v) { return (typeof v === 'string') ? v : (v == null ? '' : String(v)); }
function arr(v) { return Array.isArray(v) ? v.map(str).filter(Boolean) : (v ? [str(v)] : []); }
