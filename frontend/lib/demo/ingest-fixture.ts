// Import pre-ingerido de respaldo (§10, demo fallback): respuesta REAL de
// POST /api/events/ingest para luma.com/9x1573sw (JacHacks San Francisco, la
// hackathon del domingo 26/7), capturada el 2026-07-23 desde el JSON-LD de la
// página. Datos reales, no estimados — permite demostrar el import aunque la
// red del venue falle.

import type { EventIngestResponse } from "@/lib/api/types"

export const PREPARED_INGEST_URL = "https://luma.com/9x1573sw"

export const PREPARED_INGEST: EventIngestResponse = {
  event: {
    id: "luma-9x1573sw",
    name: "JacHacks San Francisco",
    url: "https://luma.com/9x1573sw",
    startsAt: "2026-07-26T08:00:00.000-07:00",
    endsAt: "2026-07-26T22:00:00.000-07:00",
    venue: "Founders, Inc. | San Francisco Lab",
    city: "San Francisco",
    coordinates: [-122.4318963, 37.8069129],
    organizer: "Vatsal Shah",
    sponsors: [],
    registrationStatus: "open",
    relevance: 0,
    confidence: 80,
    source: {
      id: "luma-9x1573sw-src",
      provider: "luma",
      url: "https://luma.com/9x1573sw",
      title: "JacHacks San Francisco",
      observedAt: "2026-07-23T23:53:12.000Z",
      isEstimated: false,
    },
  },
  extraction: {
    status: "complete",
    warnings: ["sponsors not present in structured data", "prize pool not present in structured data"],
    fieldsExtracted: [
      "name",
      "startsAt",
      "endsAt",
      "venue",
      "city",
      "coordinates",
      "organizer",
      "registrationStatus",
    ],
  },
}
