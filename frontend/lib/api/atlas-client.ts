// Cliente HTTP del contrato §10. Hoy solo el ingest de eventos (la búsqueda
// usa demo-adapter hasta que exista POST /api/opportunities/search).

import type { EventIngestResponse } from "./types"

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
