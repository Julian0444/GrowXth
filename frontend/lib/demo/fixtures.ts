// Fixtures de demo (§11 del plan) — dataset literal del prototipo verificado.
// Los datos son demo plausible y se etiquetan como tal en la UI.

export const DEMO_QUERY =
  "We build an observability platform for AI agents. $20K budget — looking for adoption and technical feedback."

export const DEMO_INTERPRETATION = {
  product: "Agent observability",
  objective: "Adoption + feedback",
  budget: "$20K",
}

export const TOP3 = ["bangalore", "buenosaires", "saopaulo"] as const

export type DemoCityId = (typeof TOP3)[number]

export type DemoReason = {
  impact: "+" | "−"
  label: string
  text: string
  source: string
}

export type DemoEvidence = {
  provider: string
  title: string
  when: string
  isEstimated: boolean
}

export type DemoMetrics = {
  demand: number
  developerFit: number
  eventMomentum: number
  costEfficiency: number
  competitionGap: number
}

export type DemoEvent = {
  month: string
  day: string
  name: string
  meta: string
  status: string
}

export type DemoComparison = {
  baselineScore: number
  cost: [string, string]
  saturation: [string, string]
  note: string
}

export type DemoCampaign = {
  title: string
  sub: string
  track: string
  prize: string
  workshop: string
  budget: [string, number][]
  outreach: string
  funnel: [string, number][]
  costPerRetained: string
  attributionCode: string
}

export type DemoCity = {
  name: string
  country: string
  geo: string // id numérico del país en countries-110m.json
  rank: number
  score: number
  confidence: number
  recommendation: string
  reasons: DemoReason[]
  metrics: DemoMetrics
  evidence: DemoEvidence[]
  event: DemoEvent
  comparison: DemoComparison
  campaign: DemoCampaign
}

export const DEMO_CITIES: Record<DemoCityId, DemoCity> = {
  bangalore: {
    name: "Bangalore", country: "India", geo: "356", rank: 1, score: 92, confidence: 84,
    recommendation:
      "Highest expected activation efficiency for agent tooling this quarter — strong demand, a dense builder community and low sponsor saturation.",
    reasons: [
      { impact: "+", label: "Demand", text: "agent-observability questions up 41% across dev forums in 90 days.", source: "2 sources" },
      { impact: "+", label: "Developer fit", text: "deep Python + LLM overlap in local hackathon projects.", source: "GitHub innovation graph" },
      { impact: "+", label: "Cost efficiency", text: "est. $210 per activated developer — lowest in this ranking.", source: "estimated" },
      { impact: "−", label: "Competition", text: "2 infrastructure sponsors active in the last quarter.", source: "event records" },
    ],
    metrics: { demand: 94, developerFit: 91, eventMomentum: 88, costEfficiency: 91, competitionGap: 74 },
    evidence: [
      { provider: "GitHub", title: "Innovation Graph — Python & TS activity, Karnataka", when: "observed Jul 2026", isEstimated: false },
      { provider: "Stack Ex.", title: "“agent-observability” tag velocity, 90-day window", when: "observed Jul 2026", isEstimated: false },
      { provider: "Luma", title: "Bangalore Agent Hack — sponsor prospectus", when: "observed Jul 2026", isEstimated: false },
      { provider: "Model", title: "Activation-cost band v0.3 (no partner data yet)", when: "estimated", isEstimated: true },
    ],
    event: { month: "Aug", day: "23", name: "Bangalore Agent Hack", meta: "Bangalore AI Builders · Founders Hub BLR", status: "Registration open · 2 sponsor slots" },
    comparison: {
      baselineScore: 78, cost: ["$210", "$640"], saturation: ["Low", "High"],
      note: "San Francisco still wins on senior feedback and founder access. Bangalore wins on activation efficiency per dollar.",
    },
    campaign: {
      title: "Bangalore Agent Hack — sponsor plan", sub: "Aug 23 · single-track sponsorship · $20K budget",
      track: "“Best agent-observability integration” challenge track",
      prize: "$3,000 top prize + 6-month platform credits",
      workshop: "Pre-event workshop: “Tracing agents in production” (90 min, hands-on)",
      budget: [["Track sponsorship", 8000], ["Prize", 3000], ["Workshop + travel", 4000], ["Activation credits", 3000], ["Reserve", 2000]],
      outreach:
        "Hi Ananya — we build observability for AI agents and loved the agent focus of your last edition. We'd like to sponsor a tracing track with a hands-on workshop the evening before. Could we grab 20 minutes this week?",
      funnel: [["Registrations", 240], ["Activated (first trace)", 96], ["Retained at day 30", 41]],
      costPerRetained: "$488", attributionCode: "GROWX-BLR-0823",
    },
  },
  buenosaires: {
    name: "Buenos Aires", country: "Argentina", geo: "032", rank: 2, score: 86, confidence: 79,
    recommendation:
      "Strongest talent-to-cost ratio in the ranking — organizers are actively looking for infrastructure partners.",
    reasons: [
      { impact: "+", label: "Talent density", text: "strong technical talent relative to local sponsor presence.", source: "community records" },
      { impact: "+", label: "Organizer intent", text: "2 communities explicitly open to infra sponsors this quarter.", source: "organizer submissions" },
      { impact: "−", label: "Event volume", text: "fewer large events than the top market in this window.", source: "event feeds" },
    ],
    metrics: { demand: 82, developerFit: 88, eventMomentum: 74, costEfficiency: 93, competitionGap: 88 },
    evidence: [
      { provider: "GitHub", title: "Open-source tooling contributions, AR (90d)", when: "observed Jul 2026", isEstimated: false },
      { provider: "Organizer", title: "Builders BA — partner request form", when: "observed Jun 2026", isEstimated: false },
      { provider: "Model", title: "Activation-cost band v0.3 (no partner data yet)", when: "estimated", isEstimated: true },
    ],
    event: { month: "Aug", day: "29", name: "Builders BA: Applied AI", meta: "Buenos Aires tech builders · Palermo", status: "Registration open · seeking partners" },
    comparison: {
      baselineScore: 78, cost: ["$180", "$640"], saturation: ["Very low", "High"],
      note: "Lowest estimated activation cost, with less senior-stage feedback than SF. Best fit for adoption-led budgets.",
    },
    campaign: {
      title: "Builders BA — sponsor plan", sub: "Aug 29 · workshop + prize · $20K budget",
      track: "“Best applied-agent demo” challenge",
      prize: "$2,500 top prize + platform credits",
      workshop: "Pre-event workshop: “Evals & tracing 101” (Spanish, 90 min)",
      budget: [["Event sponsorship", 7000], ["Prize", 2500], ["Workshop + travel", 5000], ["Activation credits", 3500], ["Reserve", 2000]],
      outreach:
        "Hola Sofía — vimos que Builders BA está buscando partners de infraestructura. Nos encantaría patrocinar un track aplicado con un workshop en español la semana previa. ¿Tienen 20 minutos esta semana?",
      funnel: [["Registrations", 180], ["Activated (first trace)", 79], ["Retained at day 30", 36]],
      costPerRetained: "$556", attributionCode: "GROWX-BUE-0829",
    },
  },
  saopaulo: {
    name: "São Paulo", country: "Brazil", geo: "076", rank: 3, score: 85, confidence: 81,
    recommendation:
      "Largest applied-ML ecosystem in Latin America, with Portuguese-language demand rising fast.",
    reasons: [
      { impact: "+", label: "Demand", text: "PT-language model-customization questions rising over 90 days.", source: "2 sources" },
      { impact: "+", label: "Ecosystem size", text: "largest developer ecosystem in the region, strong applied-ML activity.", source: "GitHub innovation graph" },
      { impact: "−", label: "Competition", text: "moderate sponsor presence from established vendors.", source: "event records" },
    ],
    metrics: { demand: 84, developerFit: 90, eventMomentum: 83, costEfficiency: 79, competitionGap: 70 },
    evidence: [
      { provider: "GitHub", title: "Applied-ML repo activity, BR metro areas", when: "observed Jul 2026", isEstimated: false },
      { provider: "Community", title: "SP ML Week — co-hosted workshop openings", when: "observed Jun 2026", isEstimated: false },
      { provider: "Model", title: "Activation-cost band v0.3 (no partner data yet)", when: "estimated", isEstimated: true },
    ],
    event: { month: "Sep", day: "12", name: "São Paulo ML Week", meta: "Brazil ML ecosystem · Vila Olímpia", status: "Registration open · workshops available" },
    comparison: {
      baselineScore: 78, cost: ["$260", "$640"], saturation: ["Medium", "High"],
      note: "Bigger audience than BA at a higher cost band. Strong choice when reach matters as much as efficiency.",
    },
    campaign: {
      title: "São Paulo ML Week — sponsor plan", sub: "Sep 12 · workshop track · $20K budget",
      track: "“Agents in production” workshop track",
      prize: "$2,500 top prize + platform credits",
      workshop: "Co-hosted workshop: “Observability for LLM apps” (PT-BR)",
      budget: [["Track sponsorship", 9000], ["Prize", 2500], ["Workshop + travel", 4500], ["Activation credits", 2500], ["Reserve", 1500]],
      outreach:
        "Oi Rafael — estamos construindo observabilidade para agentes de IA e adoraríamos co-apresentar um workshop prático na ML Week. Podemos conversar 20 minutos essa semana?",
      funnel: [["Registrations", 210], ["Activated (first trace)", 88], ["Retained at day 30", 37]],
      costPerRetained: "$541", attributionCode: "GROWX-SAO-0912",
    },
  },
}

export function isDemoCityId(id: string): id is DemoCityId {
  return (TOP3 as readonly string[]).includes(id)
}
