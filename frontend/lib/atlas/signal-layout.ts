import { geoMercator } from "d3-geo"
import { ATLAS_CITIES, MINOR_CLUSTERS } from "@/lib/atlas-data"

export const MAP_WIDTH = 980
export const MAP_HEIGHT = 560
export const PROJECTION_SCALE = 152
export const PROJECTION_CENTER: [number, number] = [12, 20]

// Peso relativo de cada cluster principal (valores del prototipo verificado).
const CLUSTER_STRENGTH: Record<string, number> = {
  sf: 1,
  bangalore: 1,
  saopaulo: 0.85,
  buenosaires: 0.8,
  berlin: 0.75,
  cdmx: 0.7,
}

export type SignalDot = {
  id: string
  x: number
  y: number
  r: number
  opacity: number
  breathe: { duration: number; delay: number } | null
}

export type SignalGlyph =
  | { id: string; kind: "event"; x: number; y: number }
  | { id: string; kind: "community"; x: number; y: number; r: number }
  | { id: string; kind: "company"; x: number; y: number }

export type SignalCluster = {
  id: string
  x: number
  y: number
  big: boolean
  // 3 shells por distancia al centro, para animar la entrada con stagger por shell.
  shells: [SignalDot[], SignalDot[], SignalDot[]]
  glyphs: SignalGlyph[]
}

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

const round1 = (value: number) => Math.round(value * 10) / 10
const round2 = (value: number) => Math.round(value * 100) / 100

function buildCluster(id: string, x: number, y: number, strength: number, big: boolean): SignalCluster {
  const rand = mulberry32(20260722 + x * 7 + y * 13)
  const shells: [SignalDot[], SignalDot[], SignalDot[]] = [[], [], []]
  const count = big ? Math.round(130 * strength) : Math.round(26 * strength)
  const spread = big ? 13 : 8

  for (let i = 0; i < count; i += 1) {
    const tight = rand() < 0.62
    const dx = gaussian(rand) * (tight ? spread * 0.4 : spread)
    const dy = gaussian(rand) * (tight ? spread * 0.34 : spread * 0.8)
    const dist = Math.sqrt(dx * dx + dy * dy) / spread
    const falloff = Math.max(0.1, 1 - dist * 0.6)
    const opacity = Math.min(0.72, (0.12 + rand() * 0.5) * falloff * (big ? 1 : 0.55))
    const breathes = rand() < 0.09
    const dot: SignalDot = {
      id: `${id}-demand-${i}`,
      x: round1(x + dx),
      y: round1(y + dy),
      r: round2(0.5 + rand() * 0.9 * falloff),
      opacity: round2(opacity),
      breathe: breathes ? { duration: round1(5 + rand() * 6), delay: round1(rand() * 8) } : null,
    }
    shells[dist < 0.45 ? 0 : dist < 1 ? 1 : 2].push(dot)
  }

  const glyphs: SignalGlyph[] = []
  if (big) {
    for (let i = 0; i < 7; i += 1) {
      glyphs.push({ id: `${id}-event-${i}`, kind: "event", x: round1(x + gaussian(rand) * 6), y: round1(y + gaussian(rand) * 4.5) })
    }
    for (let i = 0; i < 5; i += 1) {
      glyphs.push({
        id: `${id}-community-${i}`,
        kind: "community",
        x: round1(x + gaussian(rand) * 7),
        y: round1(y + gaussian(rand) * 5),
        r: round1(0.9 + rand() * 0.7),
      })
    }
    for (let i = 0; i < 5; i += 1) {
      glyphs.push({ id: `${id}-company-${i}`, kind: "company", x: round1(x + gaussian(rand) * 6.5), y: round1(y + gaussian(rand) * 5) })
    }
  }

  return { id, x, y, big, shells, glyphs }
}

const projection = geoMercator()
  .scale(PROJECTION_SCALE)
  .center(PROJECTION_CENTER)
  .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2])

export function projectCity(lng: number, lat: number): [number, number] {
  return projection([lng, lat]) ?? [0, 0]
}

// Determinístico (RNG sembrado): idéntico en server y cliente, sin riesgo de hydration mismatch.
export function buildSignalClusters(): SignalCluster[] {
  const clusters: SignalCluster[] = []
  for (const city of ATLAS_CITIES) {
    const [x, y] = projectCity(city.lng, city.lat)
    clusters.push(buildCluster(city.id, x, y, CLUSTER_STRENGTH[city.id] ?? 0.7, true))
  }
  MINOR_CLUSTERS.forEach((cluster, index) => {
    const [x, y] = projectCity(cluster.lng, cluster.lat)
    clusters.push(buildCluster(`m${index}`, x, y, 0.55 + (index % 4) * 0.12, false))
  })
  return clusters
}
