// Cliente HTTP compartido. Único punto por donde el frontend habla con el
// backend. Vive en lib/api/ (canónico); NO existe lib/client/.

import type { EventIngestResponse } from "./types"
import type { Decision, SearchRequest, SearchResponse } from "@/lib/contracts/growxth"
import { getFixtureSearchResponse } from "@/lib/server/demo/fixtures"

// Búsqueda de oportunidades (contrato growxth.ts). Live-first: intenta el
// backend real y, ante cualquier falla, cae al fixture preparado marcando
// degraded: true. Nunca lanza — el frontend siempre recibe un SearchResponse.
export async function searchOpportunities(req: SearchRequest): Promise<SearchResponse> {
  try {
    const response = await fetch("/api/opportunities/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    })
    if (response.ok) {
      const data: unknown = await response.json()
      if (
        typeof data === "object" &&
        data !== null &&
        "opportunities" in data &&
        Array.isArray((data as { opportunities: unknown }).opportunities)
      ) {
        return data as SearchResponse
      }
    }
  } catch {
    // red caída / timeout / body inválido → fallback
  }
  const fixture = getFixtureSearchResponse()
  return {
    ...fixture,
    query: req,
    degraded: true,
    warnings: [...fixture.warnings, "Backend no disponible; sirviendo fixture preparado."],
  }
}

export async function ingestEvent(url: string): Promise<EventIngestResponse> {
  const response = await fetch("/api/events/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  })
  // 4xx/5xx también traen EventIngestResponse (extraction "failed" + warnings).
  const payload: unknown = await response.json().catch(() => null)
  if (
    typeof payload === "object" &&
    payload !== null &&
    "extraction" in payload &&
    typeof payload.extraction === "object"
  ) {
    return payload as EventIngestResponse
  }
  throw new Error("Ingest endpoint unavailable")
}

// ---- Launch Room (§L5) ----

export interface DecisionSnapshot {
  decision: Decision
  confirmedTierPriceUsd: number | null
}

// Lee una decisión. Devuelve null si no existe (404) o ante error de red.
export async function fetchDecision(id: string): Promise<DecisionSnapshot | null> {
  try {
    const response = await fetch(`/api/decisions/${encodeURIComponent(id)}`, { cache: "no-store" })
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (typeof data === "object" && data !== null && "decision" in data) {
      return data as DecisionSnapshot
    }
  } catch {
    // red caída → null
  }
  return null
}

// Polling cada 2s (sin websockets). Devuelve una función para frenarlo.
// `onUpdate` recibe cada snapshot; solo notifica cuando algo cambió.
export function pollDecision(
  id: string,
  onUpdate: (snapshot: DecisionSnapshot) => void,
  intervalMs = 2000,
): () => void {
  let stopped = false
  let lastSerialized = ""

  const tick = async (): Promise<void> => {
    if (stopped) return
    const snapshot = await fetchDecision(id)
    if (snapshot && !stopped) {
      const serialized = JSON.stringify(snapshot)
      if (serialized !== lastSerialized) {
        lastSerialized = serialized
        onUpdate(snapshot)
      }
    }
  }

  void tick()
  const handle = setInterval(() => void tick(), intervalMs)
  return () => {
    stopped = true
    clearInterval(handle)
  }
}
