// Demo-adapter (§10): envuelve los fixtures §11 en un SearchResponse real.
// Es la implementación "sin backend" del contrato — cuando exista el backend,
// atlas-client.ts hablará con POST /api/opportunities/search y devolverá el
// MISMO tipo; los componentes no cambian.

import { ATLAS_CITIES } from "@/lib/atlas-data"
import { DEMO_CITIES, TOP3, type DemoCity, type DemoCityId } from "@/lib/demo/fixtures"
import type {
  DataCoverage,
  EventOpportunity,
  MarketComparison,
  Opportunity,
  ProductInterpretation,
  SearchRequest,
  SearchResponse,
} from "./types"

// Etapas reales del request — el analysis overlay refleja estas etapas, nunca
// porcentajes inventados (§5). Los labels son el copy exacto del plan.
export const SEARCH_STAGES = [
  { id: "understanding", label: "Understanding your product" },
  { id: "matching", label: "Matching technical communities" },
  { id: "events", label: "Finding relevant events" },
  { id: "ranking", label: "Ranking global opportunities" },
] as const

export type SearchStageId = (typeof SEARCH_STAGES)[number]["id"]

// Modo simulado del backend para ensayar los caminos de falla ANTES de que el
// backend exista: `?backend=fail` (error con retry) y `?backend=partial`
// (respuesta con fuentes caídas). Sin query param → "ok".
export type SimulatedBackendMode = "ok" | "fail" | "partial"

export function getSimulatedBackendMode(): SimulatedBackendMode {
  if (typeof window === "undefined") return "ok"
  const mode = new URLSearchParams(window.location.search).get("backend")
  return mode === "fail" || mode === "partial" ? mode : "ok"
}

const SOURCES = ["github", "stackexchange", "luma", "organizer-submissions", "activation-model"]
const EVENT_SOURCES = ["luma", "organizer-submissions"]

const COST_BAND: Record<DemoCityId, Opportunity["activationCostBand"]> = {
  bangalore: "low",
  buenosaires: "low",
  saopaulo: "medium",
}

// Qué evidencia (§11) respalda cada razón, por índice — regla §8: toda razón
// conecta con evidencia.
const REASON_EVIDENCE: Record<DemoCityId, number[][]> = {
  bangalore: [[0, 1], [0], [3], [2]],
  buenosaires: [[0], [1], [1]],
  saopaulo: [[0, 1], [0], [1]],
}

const FIXTURE_EVENT_DATES: Record<DemoCityId, string> = {
  bangalore: "2026-08-23",
  buenosaires: "2026-08-29",
  saopaulo: "2026-09-12",
}

const SATURATION: Record<string, MarketComparison["sponsorSaturation"]["market"]> = {
  "very low": "very_low",
  low: "low",
  medium: "medium",
  high: "high",
}

function parseCost(label: string): { amount: number; currency: "USD" } | null {
  const match = /\$(\d+)/.exec(label)
  return match ? { amount: Number(match[1]), currency: "USD" } : null
}

function toEvent(id: DemoCityId, city: DemoCity): EventOpportunity {
  return {
    id: `${id}-event-0`,
    name: city.event.name,
    url: "", // evento del dataset preparado — sin página pública real
    startsAt: FIXTURE_EVENT_DATES[id],
    city: city.name,
    organizer: city.event.meta.split("·")[0].trim(),
    sponsors: [],
    registrationStatus: city.event.status,
    // Derivados del fixture (dataset demo etiquetado), no scoring en vivo:
    relevance: city.metrics.eventMomentum,
    confidence: city.confidence,
    source: {
      id: `${id}-event-0-src`,
      provider: "demo",
      title: "Prepared demo dataset",
      observedAt: "2026-07-22",
      isEstimated: true,
    },
  }
}

function toOpportunity(id: DemoCityId): Opportunity {
  const city = DEMO_CITIES[id]
  const geo = ATLAS_CITIES.find((item) => item.id === id)
  return {
    id,
    rank: city.rank,
    city: city.name,
    country: city.country,
    coordinates: geo ? [geo.lng, geo.lat] : [0, 0],
    score: city.score,
    confidence: city.confidence,
    activationCostBand: COST_BAND[id],
    recommendation: city.recommendation,
    reasons: city.reasons.map((reason, index) => ({
      id: `${id}-reason-${index}`,
      label: reason.label,
      explanation: reason.text,
      impact: reason.impact === "+" ? "positive" : "negative",
      evidenceIds: (REASON_EVIDENCE[id][index] ?? []).map((evi) => `${id}-src-${evi}`),
    })),
    metrics: { ...city.metrics },
    // La nube de señales §3 se genera determinística en signal-layout (IDs
    // estables); el backend real la enviará por acá.
    signals: [],
    events: [toEvent(id, city)],
    comparison: {
      baselineCity: "San Francisco",
      baselineScore: city.comparison.baselineScore,
      costPerActivatedDev: {
        market: parseCost(city.comparison.cost[0]),
        baseline: parseCost(city.comparison.cost[1]),
        isEstimated: true, // sin datos de partners todavía
      },
      sponsorSaturation: {
        market: SATURATION[city.comparison.saturation[0].toLowerCase()] ?? "medium",
        baseline: SATURATION[city.comparison.saturation[1].toLowerCase()] ?? "high",
      },
      note: city.comparison.note,
    },
  }
}

const DEMO_INTERPRETATION_FULL: ProductInterpretation = {
  category: "Agent observability",
  problem: "Tracing and evaluating AI agents in production",
  targetAudience: ["AI engineers", "platform teams"],
  technologies: ["Python", "TypeScript", "LLM agents"],
  objective: "Adoption + feedback",
  summary:
    "Observability platform for AI agents seeking activation and technical feedback in emerging developer markets.",
}

function buildCoverage(mode: SimulatedBackendMode): DataCoverage {
  const unavailable = mode === "partial" ? EVENT_SOURCES : []
  const available = SOURCES.filter((source) => !unavailable.includes(source))
  const confidences = TOP3.map((id) => DEMO_CITIES[id].confidence)
  return {
    sourcesRequested: SOURCES,
    sourcesAvailable: available,
    unavailableSources: unavailable,
    // El dataset preparado cubre todo su alcance declarado (3 mercados):
    geographicCoverage: 100,
    confidence: Math.round(confidences.reduce((sum, item) => sum + item, 0) / confidences.length),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function buildSearchResponse(mode: SimulatedBackendMode = "ok"): SearchResponse {
  const opportunities = TOP3.map(toOpportunity)
  return {
    searchId: `ga_${crypto.randomUUID().slice(0, 8)}`,
    generatedAt: new Date().toISOString(),
    interpretation: DEMO_INTERPRETATION_FULL,
    opportunities:
      mode === "partial"
        ? opportunities.map((opportunity) => ({ ...opportunity, events: [] }))
        : opportunities,
    dataCoverage: buildCoverage(mode),
  }
}

export type SearchOptions = {
  onStage?: (stageId: SearchStageId, index: number) => void
  stageMs?: number
  tailMs?: number
  // "Use prepared demo" (§10): fuerza los fixtures ignorando el modo simulado.
  forceDemo?: boolean
}

export async function searchOpportunities(
  _request: SearchRequest,
  { onStage, stageMs = 460, tailMs = 180, forceDemo = false }: SearchOptions = {},
): Promise<SearchResponse> {
  const mode = forceDemo ? "ok" : getSimulatedBackendMode()
  for (const [index, stage] of SEARCH_STAGES.entries()) {
    onStage?.(stage.id, index)
    // El modo fail cae buscando eventos — el paso en curso queda visible.
    if (mode === "fail" && stage.id === "events") {
      await sleep(stageMs)
      throw new Error("Live signal sources didn't respond.")
    }
    await sleep(stageMs)
  }
  await sleep(tailMs)
  return buildSearchResponse(mode)
}
