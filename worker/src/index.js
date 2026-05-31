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
const MODEL = 'claude-sonnet-4-6'; // 게이트웨이 제공 모델(haiku는 미provision). 교체 시 이 줄만.
const MAX_TOKENS = 1500;
const TEMPERATURE = 0.4;

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
    if (request.method !== 'POST' || !url.pathname.endsWith('/interpret')) {
      return json({ error: 'Not found. POST /interpret.' }, 404, origin);
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

    const { scope, regionId, context } = payload || {};
    if (!scope || !regionId || !context) {
      return json({ error: 'scope, regionId, context 필수.' }, 400, origin);
    }

    const messages = buildMessages(scope, regionId, context);

    let gwResp;
    try {
      gwResp = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.MINDLOGIC_API_KEY}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, temperature: TEMPERATURE, messages }),
      });
    } catch (e) {
      return json({ error: 'Gateway 호출 실패', detail: String(e) }, 502, origin);
    }

    if (!gwResp.ok) {
      const text = await gwResp.text().catch(() => '');
      return json({ error: `Gateway ${gwResp.status}`, detail: text.slice(0, 300) }, 502, origin);
    }

    let data;
    try { data = await gwResp.json(); }
    catch { return json({ error: 'Gateway 응답 파싱 실패' }, 502, origin); }

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed) {
      return json({ error: 'LLM JSON 파싱 실패', raw: content.slice(0, 400) }, 502, origin);
    }

    // 표준 스키마로 정규화 (누락 키 방어)
    const result = {
      headline: str(parsed.headline),
      strengths: arr(parsed.strengths),
      weaknesses: arr(parsed.weaknesses),
      policy_recommendation: str(parsed.policy_recommendation),
      vision_comment: str(parsed.vision_comment),
      priority_actions: arr(parsed.priority_actions),
      _model: MODEL,
      _usage: data.usage || null,
    };
    return json(result, 200, origin);
  },
};

// ── 프롬프트 조립 ──────────────────────────────────────────────
function buildMessages(scope, regionId, ctx) {
  const sys = scope === 'eup'
    ? '너는 농촌공간계획 정책 분석가다. 남양주시 민선 8기 비전(THE: T 교통·H 삶의질·E 교육환경)과 제공된 읍면 지표·비전 적합도·발화 트리거를 근거로 해석한다. ' +
      '반드시 유효한 JSON 객체 하나만 출력하고 코드펜스/설명 텍스트는 절대 쓰지 마라. ' +
      '키: headline(1문장), strengths(2개 배열), weaknesses(2개 배열), policy_recommendation(1~2문장), vision_comment(비전 적합도를 해석하는 1문장), priority_actions(우선 조치 2개 배열). 모두 한국어, 정책 실무자용. ' +
      '각 배열 항목은 한 문장(60자 이내)으로 간결하게. 전체 JSON은 짧게 유지.'
    : '너는 농촌공간계획 정책 분석가다. 경기도 농촌다움 지표(삶터·일터·쉼터)와 제공된 시군 지표를 근거로 해석한다. ' +
      '반드시 유효한 JSON 객체 하나만 출력하고 코드펜스/설명 텍스트는 절대 쓰지 마라. ' +
      '키: headline(1문장), strengths(2~3개 배열), weaknesses(2~3개 배열), policy_recommendation(1~2문장), vision_comment(""), priority_actions([]). 모두 한국어, 간결.';

  const user = scope === 'eup' ? eupUserPrompt(regionId, ctx) : sigunUserPrompt(regionId, ctx);
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
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
