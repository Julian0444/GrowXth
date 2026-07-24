// Formatter de respuesta SMS/mensajería (T4). Función pura.
// Restricciones: ≤3 opciones, ~500 chars en total, exactamente 1 link por
// opción. No presenta costos porque las fuentes no ofrecen precios verificables.

import type { Opportunity, SearchResponse } from '@/lib/contracts/growxth';

export interface SmsReplyOptions {
  baseUrl?: string; // p.ej. https://growxth.app — de env APP_URL en la ruta
  maxChars?: number;
  shareId?: string;
}

const DEFAULT_MAX = 500;

function link(baseUrl: string, opp: Opportunity, shareId?: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({ opp: opp.id });
  if (shareId) params.set('linq', shareId);
  return `${base}/?${params.toString()}`;
}

export function formatSmsReply(response: SearchResponse, options: SmsReplyOptions = {}): string {
  const baseUrl = options.baseUrl ?? '';
  const maxChars = options.maxChars ?? DEFAULT_MAX;

  const top = response.opportunities.slice(0, 3);
  if (top.length === 0) {
    return 'No encontré jugadas con evidencia todavía. Probá con un ICP más amplio.';
  }

  const header = `${top.length} mercado${top.length > 1 ? 's' : ''} global${top.length > 1 ? 'es' : ''}:`;

  // Presupuesto de caracteres por opción para el texto (sin el link).
  const lines = top.map((opp, i) => {
    const url = link(baseUrl, opp, options.shareId);
    // Reservamos el link completo + numeración; recortamos solo el título.
    const prefix = `${i + 1}) `;
    const distance = opp.distanceMiles != null ? ` · ${opp.distanceMiles}mi` : '';
    const suffix = `${distance} → ${url}`;
    const titleBudget = Math.max(20, Math.floor((maxChars - header.length) / top.length) - suffix.length - prefix.length);
    let title = opp.title;
    if (title.length > titleBudget) title = `${title.slice(0, Math.max(1, titleBudget - 1)).trimEnd()}…`;
    return `${prefix}${title}${suffix}`;
  });

  let out = [header, ...lines].join('\n');
  // Red de seguridad dura: nunca exceder maxChars (recorta opciones de abajo
  // hacia arriba antes que cortar un link a la mitad).
  while (out.length > maxChars && lines.length > 1) {
    lines.pop();
    out = [header, ...lines].join('\n');
  }
  return out;
}
