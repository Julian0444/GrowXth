// Cliente HTTP compartido. Único punto por donde el frontend habla con el
// backend. Vive en lib/api/ (canónico); NO existe lib/client/.

import type { EventIngestResponse } from "./types"
import type { SearchRequest, SearchResponse } from "@/lib/contracts/growxth"
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
