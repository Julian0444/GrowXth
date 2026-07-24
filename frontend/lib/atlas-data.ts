export type AtlasLayer = "demand" | "events" | "communities" | "companies"

export type Objective = "adoption" | "feedback" | "talent" | "awareness"

export type TimeRange = "7d" | "30d" | "90d"

export type AtlasCity = {
  id: string
  name: string
  country: string
  lat: number
  lng: number
  potential: number
  efficiency: number
  events: number
  communityScore: number
  companiesExploring: number
  costBand: string
  upcomingEvent: string
  eventDate: string
  community: string
  topics: Record<string, number>
  evidence: [string, string, string]
}

export type ScoredCity = AtlasCity & {
  opportunityScore: number
  demandScore: number
  developerFit: number
  eventMomentum: number
  topic: string
  reason: string
}

export const LAYER_LABELS: Record<AtlasLayer, string> = {
  demand: "Demand",
  events: "Events",
  communities: "Communities",
  companies: "Companies",
}

export const SEARCH_PRESETS = ["Fine-tuning API", "Agent observability", "Vector database"]

export const ATLAS_CITIES: AtlasCity[] = [
  {
    id: "sf",
    name: "San Francisco",
    country: "United States",
    lat: 37.7749,
    lng: -122.4194,
    potential: 92,
    efficiency: 38,
    events: 1842,
    communityScore: 96,
    companiesExploring: 14,
    costBand: "High",
    upcomingEvent: "AI Builders Forum",
    eventDate: "Aug 18",
    community: "Bay Area AI builders",
    topics: { general: 93, fine_tuning: 78, agents: 95, vector: 88, cloud: 96 },
    evidence: [
      "High concentration of advanced AI infrastructure teams",
      "Strong event quality, but sponsor competition is saturated",
      "Highest estimated activation cost in the current comparison",
    ],
  },
  {
    id: "cdmx",
    name: "Mexico City",
    country: "Mexico",
    lat: 19.4326,
    lng: -99.1332,
    potential: 78,
    efficiency: 76,
    events: 1264,
    communityScore: 82,
    companiesExploring: 5,
    costBand: "Medium-low",
    upcomingEvent: "Latam AI Community Day",
    eventDate: "Sep 06",
    community: "CDMX AI & data community",
    topics: { general: 76, fine_tuning: 82, agents: 84, vector: 72, cloud: 74 },
    evidence: [
      "Spanish-language demand signals have accelerated over 30 days",
      "Active university and independent builder communities",
      "Lower sponsor saturation than comparable North American hubs",
    ],
  },
  {
    id: "buenosaires",
    name: "Buenos Aires",
    country: "Argentina",
    lat: -34.6037,
    lng: -58.3816,
    potential: 76,
    efficiency: 86,
    events: 743,
    communityScore: 88,
    companiesExploring: 3,
    costBand: "Low",
    upcomingEvent: "Builders BA: Applied AI",
    eventDate: "Aug 29",
    community: "Buenos Aires tech builders",
    topics: { general: 74, fine_tuning: 88, agents: 82, vector: 78, cloud: 72 },
    evidence: [
      "Strong technical talent relative to local sponsor presence",
      "Growing interest in model adaptation and open-source tooling",
      "Organizers are actively seeking infrastructure partners",
    ],
  },
  {
    id: "saopaulo",
    name: "Sao Paulo",
    country: "Brazil",
    lat: -23.5505,
    lng: -46.6333,
    potential: 84,
    efficiency: 79,
    events: 1027,
    communityScore: 90,
    companiesExploring: 7,
    costBand: "Medium",
    upcomingEvent: "Sao Paulo ML Week",
    eventDate: "Sep 12",
    community: "Brazil ML ecosystem",
    topics: { general: 82, fine_tuning: 91, agents: 86, vector: 80, cloud: 84 },
    evidence: [
      "Portuguese-language model customization questions are rising",
      "Large developer ecosystem with strong applied-ML activity",
      "Several communities are open to co-hosted technical workshops",
    ],
  },
  {
    id: "berlin",
    name: "Berlin",
    country: "Germany",
    lat: 52.52,
    lng: 13.405,
    potential: 80,
    efficiency: 68,
    events: 1158,
    communityScore: 86,
    companiesExploring: 8,
    costBand: "Medium-high",
    upcomingEvent: "Open Source AI Berlin",
    eventDate: "Sep 19",
    community: "Berlin open-source network",
    topics: { general: 80, fine_tuning: 84, agents: 78, vector: 86, cloud: 81 },
    evidence: [
      "High-quality open-source and research-oriented participation",
      "Strong fit for technical feedback and contributor acquisition",
      "Moderate competition from established infrastructure vendors",
    ],
  },
  {
    id: "bangalore",
    name: "Bangalore",
    country: "India",
    lat: 12.9716,
    lng: 77.5946,
    potential: 95,
    efficiency: 91,
    events: 1691,
    communityScore: 94,
    companiesExploring: 11,
    costBand: "Low-medium",
    upcomingEvent: "Bangalore Agent Hack",
    eventDate: "Aug 23",
    community: "Bangalore AI builders",
    topics: { general: 92, fine_tuning: 94, agents: 97, vector: 91, cloud: 93 },
    evidence: [
      "High volume of Python and model adaptation activity",
      "Multiple upcoming builder events with sponsor openings",
      "Strong opportunity-to-cost ratio for developer activation",
    ],
  },
]

const TOPIC_ALIASES: Record<string, string[]> = {
  fine_tuning: ["fine-tun", "fine tun", "custom model", "model training", "adapt model"],
  agents: ["agent", "observability", "eval", "mcp", "llm"],
  vector: ["vector", "embedding", "retrieval", "rag", "database"],
  cloud: ["cloud", "infrastructure", "api", "developer tool", "devtool"],
}

const OBJECTIVE_BONUS: Record<Objective, keyof AtlasCity> = {
  adoption: "efficiency",
  feedback: "communityScore",
  talent: "communityScore",
  awareness: "potential",
}

function clamp(value: number) {
  return Math.max(0, Math.min(99, Math.round(value)))
}

function hashNoise(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) hash = (hash * 31 + input.charCodeAt(i)) | 0
  return ((Math.abs(hash) % 900) / 100) - 4.5
}

export function detectTopic(query: string) {
  const normalized = query.toLowerCase()
  for (const [topic, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias))) return topic
  }
  return "general"
}

export function topicLabel(topic: string) {
  return {
    fine_tuning: "model fine-tuning",
    agents: "AI agents",
    vector: "vector search",
    cloud: "developer infrastructure",
    general: "developer technology",
  }[topic] ?? "developer technology"
}

export function scoreCities(
  query: string,
  objective: Objective,
  layers: AtlasLayer[],
  timeRange: TimeRange,
): ScoredCity[] {
  const topic = detectTopic(query)
  const rangeBoost = timeRange === "7d" ? -2 : timeRange === "90d" ? 2 : 0

  return ATLAS_CITIES.map((city) => {
    const topicFit = city.topics[topic] ?? city.topics.general
    const demandScore = clamp(topicFit + hashNoise(`${query}-${city.id}`) + rangeBoost)
    const developerFit = clamp(topicFit * 0.55 + city.communityScore * 0.45)
    const eventMomentum = clamp(city.potential * 0.45 + Math.min(98, city.events / 20) * 0.55 + rangeBoost)
    const objectiveMetric = Number(city[OBJECTIVE_BONUS[objective]])

    const layerValues: Record<AtlasLayer, number> = {
      demand: demandScore,
      events: eventMomentum,
      communities: city.communityScore,
      companies: clamp(50 + city.companiesExploring * 3),
    }
    const activeLayerAverage = layers.length
      ? layers.reduce((total, layer) => total + layerValues[layer], 0) / layers.length
      : city.potential

    const opportunityScore = clamp(
      demandScore * 0.3 +
        developerFit * 0.22 +
        city.efficiency * 0.2 +
        objectiveMetric * 0.13 +
        activeLayerAverage * 0.15,
    )

    return {
      ...city,
      opportunityScore,
      demandScore,
      developerFit,
      eventMomentum,
      topic,
      reason: `${city.name} combines ${demandScore >= 85 ? "strong" : "growing"} ${topicLabel(topic)} demand with ${city.costBand.toLowerCase()} activation costs and an active local developer community.`,
    }
  }).sort((a, b) => b.opportunityScore - a.opportunityScore)
}

export const MINOR_CLUSTERS: { lat: number; lng: number; weight: number }[] = [
  { lat: 40.71, lng: -74.0, weight: 0.5 },
  { lat: 51.5, lng: -0.12, weight: 0.45 },
  { lat: 35.68, lng: 139.69, weight: 0.4 },
  { lat: 1.35, lng: 103.82, weight: 0.35 },
  { lat: 48.85, lng: 2.35, weight: 0.3 },
  { lat: -33.87, lng: 151.21, weight: 0.3 },
  { lat: 6.52, lng: 3.37, weight: 0.25 },
  { lat: 31.23, lng: 121.47, weight: 0.35 },
  { lat: 25.2, lng: 55.27, weight: 0.25 },
  { lat: 43.65, lng: -79.38, weight: 0.3 },
  { lat: 47.6, lng: -122.33, weight: 0.3 },
  { lat: 30.27, lng: -97.74, weight: 0.25 },
  { lat: 4.71, lng: -74.07, weight: 0.2 },
  { lat: 59.33, lng: 18.07, weight: 0.2 },
  { lat: 37.57, lng: 126.98, weight: 0.3 },
  { lat: 19.08, lng: 72.88, weight: 0.3 },
  { lat: -26.2, lng: 28.05, weight: 0.2 },
]

export type DensityDot = { lng: number; lat: number; r: number; opacity: number }

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function generateDensityDots(cities: ScoredCity[]): DensityDot[] {
  const rand = mulberry32(20260712 + cities.reduce((sum, city) => sum + city.opportunityScore, 0))
  const dots: DensityDot[] = []

  const addCluster = (lat: number, lng: number, count: number, spread: number, intensity: number) => {
    for (let i = 0; i < count; i += 1) {
      const tier = rand() < 0.62 ? spread * 0.42 : spread
      const dLat = gaussian(rand) * tier
      const dLng = gaussian(rand) * tier * 1.4
      const distance = Math.sqrt(dLat * dLat + dLng * dLng) / spread
      const falloff = Math.max(0.12, 1 - distance * 0.55)
      dots.push({
        lat: lat + dLat,
        lng: lng + dLng,
        r: 0.45 + rand() * 0.78 * falloff,
        opacity: Math.min(0.78, (0.18 + rand() * 0.62) * falloff * intensity),
      })
    }
  }

  cities.forEach((city) => addCluster(city.lat, city.lng, Math.round(city.opportunityScore * 2), 4.2, 1))
  MINOR_CLUSTERS.forEach((cluster) =>
    addCluster(cluster.lat, cluster.lng, Math.round(45 * cluster.weight), 3.2, 0.48),
  )

  return dots
}

export function formatNumber(value: number) {
  return value.toLocaleString("en-US")
}
