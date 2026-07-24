// Conector Linq (mensajería). REGLA: no conocemos el SDK real de Linq (pivoteó
// a API de mensajería este año). NO inventamos el SDK: definimos la interfaz,
// implementamos un mock con la forma correcta, y marcamos con TODO(linq) el
// punto EXACTO donde va la llamada real. Todo el resto del sistema (webhook,
// parser, formatter, scoring, UI) se construye contra esta interfaz.
//
// Para pegar la implementación real: buscá el botón "Copy Agent Instructions"
// en la home de Linq y reemplazá SOLO los cuerpos marcados TODO(linq).

import { createHmac, timingSafeEqual } from 'node:crypto';

// ---- Formas de mensajes (nuestra interfaz, no la de Linq) ----
export interface LinqInboundMessage {
  kind: 'message';
  messageId: string;
  from: string; // handle/teléfono del remitente
  threadId: string;
  text: string;
  receivedAt: string;
}

export interface LinqInboundReaction {
  kind: 'reaction';
  messageId: string; // mensaje al que reacciona
  from: string;
  threadId: string;
  reaction: string; // tapback / emoji
  receivedAt: string;
}

export type LinqInboundEvent = LinqInboundMessage | LinqInboundReaction;

export interface LinqOutboundMessage {
  to: string; // GUARDARRAÍL: solo el remitente del mensaje entrante
  threadId: string;
  text: string;
  linkUrl?: string;
}

export interface LinqSendResult {
  ok: boolean;
  id: string | null;
  error?: string;
}

export interface LinqConnector {
  // Verifica la firma del webhook (HMAC-SHA256 del raw body). Timing-safe.
  verifySignature(rawBody: string, signatureHeader: string | null, secret: string | null): boolean;
  // Normaliza el payload crudo del webhook a nuestro tipo de evento.
  parseInbound(payload: unknown): LinqInboundEvent | null;
  // Envía un mensaje saliente (respuesta). Nunca lanza.
  sendMessage(msg: LinqOutboundMessage): Promise<LinqSendResult>;
}

function verifyHmac(rawBody: string, signatureHeader: string | null, secret: string | null): boolean {
  // Sin secreto configurado: en desarrollo aceptamos (con la advertencia que
  // emite el guard de env en T7). En prod, sin secreto => rechazar.
  if (!secret) return process.env.NODE_ENV !== 'production';
  if (!signatureHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  // El header puede venir como "sha256=<hex>".
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function normalizeInbound(payload: unknown): LinqInboundEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const type = typeof p.type === 'string' ? p.type : '';
  const from = typeof p.from === 'string' ? p.from : '';
  const threadId = typeof p.threadId === 'string' ? p.threadId : from;
  const messageId = typeof p.messageId === 'string' ? p.messageId : '';
  const receivedAt = typeof p.receivedAt === 'string' ? p.receivedAt : new Date().toISOString();
  if (!from) return null;

  if (type === 'reaction') {
    return {
      kind: 'reaction',
      messageId,
      from,
      threadId,
      reaction: typeof p.reaction === 'string' ? p.reaction : '',
      receivedAt,
    };
  }
  // Por defecto lo tratamos como mensaje de texto.
  const text = typeof p.text === 'string' ? p.text : '';
  if (!text) return null;
  return { kind: 'message', messageId, from, threadId, text, receivedAt };
}

// Mock: no toca la red. Registra los envíos en memoria para inspección en la
// demo y devuelve ok. La firma y el parseo SON reales (no mockeados) para que
// el webhook se ejerza de verdad end-to-end.
const sentLog: LinqOutboundMessage[] = [];

export function getMockSentLog(): readonly LinqOutboundMessage[] {
  return sentLog;
}

export const mockLinq: LinqConnector = {
  verifySignature: verifyHmac,
  parseInbound: normalizeInbound,
  async sendMessage(msg: LinqOutboundMessage): Promise<LinqSendResult> {
    // TODO(linq): reemplazar por la llamada real de envío de Linq. Algo como:
    //   const res = await fetch("https://api.linq.app/v1/messages", {
    //     method: "POST",
    //     headers: { authorization: `Bearer ${process.env.LINQ_API_KEY}`, "content-type": "application/json" },
    //     body: JSON.stringify({ to: msg.to, thread_id: msg.threadId, text: msg.text }),
    //   })
    //   return { ok: res.ok, id: res.ok ? (await res.json()).id : null }
    // Pegá la firma exacta desde "Copy Agent Instructions" de Linq.
    sentLog.push(msg);
    return { ok: true, id: `mock-${sentLog.length}` };
  },
};

// El resto del sistema importa SIEMPRE `linq`, no el mock directo, para poder
// cambiar a la implementación real en un solo lugar.
export const linq: LinqConnector = mockLinq;
