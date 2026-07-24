// POST /api/linq/webhook — entrada de mensajería Linq.
//
// GUARDARRAÍL: solo se responde a QUIEN ESCRIBIÓ (msg.from). Nunca se envía a
// terceros, ni se difunde a un grupo. La respuesta va 1:1 al remitente.
//
// Ramifica por tipo de evento:
//   message  → corre la búsqueda y responde con ≤3 jugadas (sms-reply).
//   reaction → registra una señal de decisión en la Launch Room (§L5).

import { NextResponse } from 'next/server';

import type { SearchRequest } from '@/lib/contracts/growxth';
import { linq, type LinqInboundReaction } from '@/lib/server/connectors/linq';
import { addSignal, createSignal, ensureDecision } from '@/lib/server/decisions/store';
import { formatSmsReply } from '@/lib/server/format/sms-reply';
import { searchOrFixture } from '@/lib/server/pipeline/resolve';

const STACK_VOCAB = [
  'python', 'postgres', 'fastapi', 'django', 'rust', 'go', 'golang', 'typescript',
  'javascript', 'node', 'react', 'kubernetes', 'llm', 'ai', 'ml', 'data',
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseSearchRequest(text: string): SearchRequest {
  const lower = text.toLowerCase();
  const icpStack = STACK_VOCAB.filter((s) => lower.includes(s)).map(cap);
  let budgetUsd = 0;
  const k = /\$\s*(\d+(?:\.\d+)?)\s*k\b/i.exec(text);
  const plain = /\$\s*(\d{3,})\b/.exec(text);
  if (k) budgetUsd = Math.round(Number(k[1]) * 1000);
  else if (plain) budgetUsd = Number(plain[1]);
  const goal: SearchRequest['goal'] = /hiring|recruit|talent/.test(lower)
    ? 'hiring'
    : /awareness|brand/.test(lower)
      ? 'awareness'
      : /feedback/.test(lower)
        ? 'feedback'
        : 'adoption';
  return { product: text.trim(), icpStack, budgetUsd, goal };
}

// Mapeo tapback → tipo de señal de decisión.
function reactionToSignalType(
  reaction: string,
  role: 'owner' | 'teammate' | 'organizer',
): 'approve' | 'reject' | 'request_evidence' | 'confirm_availability' {
  if (/[✅]|confirm/i.test(reaction) && role === 'organizer') return 'confirm_availability';
  if (/[👎]|no|reject/i.test(reaction)) return 'reject';
  if (/[❓❔?]|evidence|proof/i.test(reaction)) return 'request_evidence';
  return 'approve';
}

function parseRole(value: unknown): 'owner' | 'teammate' | 'organizer' {
  return value === 'owner' || value === 'organizer' ? value : 'teammate';
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature =
    request.headers.get('x-linq-signature') ?? request.headers.get('x-signature');
  const secret = process.env.LINQ_WEBHOOK_SECRET ?? null;

  if (!linq.verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const event = linq.parseInbound(payload);
  if (!event) {
    return NextResponse.json({ ok: false, error: 'unrecognized event' }, { status: 400 });
  }

  // ---- Rama REACCIÓN → señal de decisión ----
  if (event.kind === 'reaction') {
    const reaction = event as LinqInboundReaction;
    const raw = payload as Record<string, unknown>;
    const role = parseRole(raw.role);
    const decisionId = typeof raw.decisionId === 'string' ? raw.decisionId : reaction.threadId;
    const opportunityId = typeof raw.opportunityId === 'string' ? raw.opportunityId : '';
    const tierPriceUsd = typeof raw.tierPriceUsd === 'number' ? raw.tierPriceUsd : undefined;

    ensureDecision(decisionId, opportunityId, reaction.threadId);
    const type = reactionToSignalType(reaction.reaction, role);
    const signal = createSignal(role, type, tierPriceUsd != null ? { tierPriceUsd } : undefined);
    const decision = addSignal(decisionId, signal);

    return NextResponse.json({
      ok: true,
      handled: 'reaction',
      decisionId,
      signalType: type,
      becomesEvidence: signal.becomesEvidence,
      consensus: decision?.consensus ?? 0,
      confidenceDelta: decision?.confidenceDelta ?? 0,
      state: decision?.state ?? 'open',
    });
  }

  // ---- Rama MENSAJE → búsqueda + respuesta 1:1 ----
  const searchRequest = parseSearchRequest(event.text);
  const response = searchOrFixture(searchRequest);
  const baseUrl = process.env.APP_URL ?? '';
  const reply = formatSmsReply(response, { baseUrl });

  const top = response.opportunities[0];
  const ogUrl = top ? `${baseUrl.replace(/\/+$/, '')}/api/og/opportunity?id=${encodeURIComponent(top.id)}` : null;

  // GUARDARRAÍL: `to` es SIEMPRE el remitente. Nunca otro destinatario.
  const sent = await linq.sendMessage({
    to: event.from,
    threadId: event.threadId,
    text: reply,
    linkUrl: ogUrl ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    handled: 'message',
    to: event.from,
    plays: response.opportunities.length,
    degraded: response.degraded,
    reply,
    ogUrl,
    sent,
  });
}
