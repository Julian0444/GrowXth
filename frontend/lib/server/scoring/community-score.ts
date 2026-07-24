// Community scorer (§4). Función PURA sin I/O: entra { community, evidence,
// request } y sale { score, breakdown, reasons }. Testeable y defendible.
//
// Pesos: stackOverlap .25 · cadenceReliability .20 · access .20 ·
//        exclusivityGap .15 · durability .10 · confidence .10
//
// Toda reason emitida lleva evidenceIds NO vacío. Si una comunidad no tiene
// evidencia resoluble, no emitimos reasons (mejor silencio que una razón sin
// respaldo).

import type {
  Community,
  CommunityBreakdown,
  Evidence,
  Reason,
  SearchRequest,
} from '@/lib/contracts/growxth';
import { avg, clamp01, coverageRatio, weightedScore } from './score-utils.ts';

// Año de referencia fijo para que `durability` sea determinista y testeable
// (en vez de depender de la fecha de ejecución).
const REFERENCE_YEAR = 2026;

export const COMMUNITY_WEIGHTS: Record<keyof CommunityBreakdown, number> = {
  stackOverlap: 0.25,
  cadenceReliability: 0.2,
  access: 0.2,
  exclusivityGap: 0.15,
  durability: 0.1,
  confidence: 0.1,
};

export interface CommunityScoreInput {
  community: Community;
  evidence: Evidence[];
  request: SearchRequest;
}

export interface CommunityScoreResult {
  score: number;
  breakdown: CommunityBreakdown;
  reasons: Reason[];
}

function scoreCadence(c: Community): number | null {
  if (c.eventsRun12mo == null) return null;
  // 12 corridas en 12 meses = tope de fiabilidad.
  return clamp01(c.eventsRun12mo / 12);
}

function scoreAccess(c: Community): number | null {
  const hasOrganizers = c.organizerIds.length > 0;
  const acceptsSponsors = c.pastSponsors.length > 0;
  if (!hasOrganizers && !acceptsSponsors) return null; // sin señal de acceso
  return clamp01((hasOrganizers ? 0.5 : 0) + (acceptsSponsors ? 0.5 : 0));
}

function scoreExclusivityGap(c: Community): number {
  // Menos sponsors conocidos = más whitespace para ser EL sponsor.
  // Nunca null: pastSponsors es un array concreto; vacío = alto gap a propósito.
  return clamp01(1 / (1 + c.pastSponsors.length));
}

function scoreDurability(c: Community): number | null {
  const parts: number[] = [];
  if (c.foundedYear != null) {
    parts.push(clamp01((REFERENCE_YEAR - c.foundedYear) / 10));
  }
  if (c.eventsRun12mo != null) {
    parts.push(clamp01(c.eventsRun12mo / 12));
  }
  return avg(parts);
}

export function scoreCommunity(input: CommunityScoreInput): CommunityScoreResult {
  const { community, evidence, request } = input;

  const owned = evidence.filter((e) => community.evidenceIds.includes(e.id));
  const support = owned.map((e) => e.id);

  const breakdown: CommunityBreakdown = {
    stackOverlap: coverageRatio(community.stack, request.icpStack),
    cadenceReliability: scoreCadence(community),
    access: scoreAccess(community),
    exclusivityGap: scoreExclusivityGap(community),
    durability: scoreDurability(community),
    confidence: avg(owned.map((e) => clamp01(e.confidence))),
  };

  const score = weightedScore(breakdown, COMMUNITY_WEIGHTS);

  // Reasons: solo las respaldadas por evidencia resoluble.
  const reasons: Reason[] = [];
  if (support.length > 0) {
    if (breakdown.stackOverlap != null && breakdown.stackOverlap >= 0.5) {
      reasons.push({
        text: `El stack de ${community.name} cubre ${Math.round(
          breakdown.stackOverlap * 100,
        )}% del ICP.`,
        evidenceIds: support,
      });
    }
    if (
      breakdown.cadenceReliability != null &&
      breakdown.cadenceReliability >= 0.5 &&
      community.eventsRun12mo != null
    ) {
      reasons.push({
        text: `Cadencia corrida de verdad: ${community.eventsRun12mo} eventos en 12 meses.`,
        evidenceIds: support,
      });
    }
    if (breakdown.exclusivityGap != null && breakdown.exclusivityGap >= 0.5) {
      reasons.push({
        text:
          community.pastSponsors.length === 0
            ? `Sin sponsors conocidos — espacio abierto para ser el primero.`
            : `Pocos sponsors previos (${community.pastSponsors.length}) — hay whitespace.`,
        evidenceIds: support,
      });
    }
  }

  return { score, breakdown, reasons };
}
