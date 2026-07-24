// Pipeline de búsqueda (T2). Orquesta grafo semilla + scorers puros + ROI y
// arma el SearchResponse. Presupuesto total 8s con degradación parcial: si un
// paso se pasa del deadline, se salta con warning y se sigue (los conectores
// live de Exa/Terac se enganchan acá en T5/T6).
//
// Con grafo vacío devuelve opportunities: []. La ruta decide el fallback al
// fixture — el pipeline nunca inventa datos.

import type {
  Coverage,
  Evidence,
  EvidenceSource,
  Opportunity,
  Reason,
  SearchRequest,
  SearchResponse,
  SFEvent,
  Status,
  Theme,
} from '@/lib/contracts/growxth';
import {
  loadEvidence,
  loadGraph,
  loadThemes,
  type SeedGraph,
} from '@/lib/server/graph/load-graph';
import { scoreCommunity } from '@/lib/server/scoring/community-score';
import { scoreTheme } from '@/lib/server/scoring/theme-score';
import { computeRoi } from '@/lib/server/scoring/roi';
import { clamp01 } from '@/lib/server/scoring/score-utils';

export interface PipelineDeps {
  graph: SeedGraph;
  themes: Theme[];
  evidence: Evidence[];
}

export interface PipelineOptions {
  budgetMs?: number;
  // Enganche de T5: cuando es true, icpFitRate/validación humana vienen de Terac.
  includeHumanValidation?: boolean;
  deps?: Partial<PipelineDeps>;
}

const STATUS_RANK: Record<Status, number> = { observed: 3, estimated: 2, prepared: 1 };

function bestStatus(evidence: Evidence[]): Status {
  let best: Status = 'prepared';
  for (const e of evidence) {
    if (STATUS_RANK[e.status] > STATUS_RANK[best]) best = e.status;
  }
  return best;
}

function cheapestTierPrice(event: SFEvent | null): number | null {
  if (!event) return null;
  const priced = event.sponsorTiers
    .map((t) => t.priceUsd)
    .filter((p): p is number => p != null && p > 0);
  return priced.length ? Math.min(...priced) : null;
}

function loadDeps(deps?: Partial<PipelineDeps>): PipelineDeps {
  return {
    graph: deps?.graph ?? loadGraph(),
    themes: deps?.themes ?? loadThemes(),
    evidence: deps?.evidence ?? loadEvidence(),
  };
}

// Une reasons de comunidad + tema, garantizando que cada una tenga evidenceIds
// resolubles contra el mapa disponible.
function collectCitedIds(reasons: Reason[]): string[] {
  const ids = new Set<string>();
  for (const r of reasons) for (const id of r.evidenceIds) ids.add(id);
  return [...ids];
}

export function searchOpportunities(
  request: SearchRequest,
  options: PipelineOptions = {},
): SearchResponse {
  const budgetMs = options.budgetMs ?? 8000;
  const startedAt = Date.now();
  const deadlineHit = (): boolean => Date.now() - startedAt > budgetMs;

  const warnings: string[] = [];
  const sourcesUsed = new Set<EvidenceSource>();
  const sourcesFailed = new Set<EvidenceSource>();

  const { graph, themes, evidence } = loadDeps(options.deps);
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  for (const e of evidence) sourcesUsed.add(e.source);

  const candidates: Opportunity[] = [];

  for (const community of graph.communities) {
    if (deadlineHit()) {
      warnings.push('Se alcanzó el presupuesto de 8s; ranking parcial.');
      break;
    }
    if (themes.length === 0) break;

    // Elegí el tema mejor punteado para esta comunidad.
    let bestTheme: { theme: Theme; result: ReturnType<typeof scoreTheme> } | null = null;
    for (const theme of themes) {
      const result = scoreTheme({ theme, community, evidence, request });
      if (!bestTheme || result.score > bestTheme.result.score) {
        bestTheme = { theme, result };
      }
    }
    if (!bestTheme) continue;

    const communityRes = scoreCommunity({ community, evidence, request });

    // Evento vinculado a la comunidad (si hay); si no, evento a co-crear.
    const event =
      graph.events.find((e) => e.communityIds.includes(community.id)) ?? null;

    const reasons: Reason[] = [...communityRes.reasons, ...bestTheme.result.reasons];
    // Regla dura: toda oportunidad devuelta tiene ≥1 reason con evidencia.
    if (reasons.length === 0) continue;

    const citedIds = collectCitedIds(reasons);
    const citedEvidence = citedIds
      .map((id) => evidenceById.get(id))
      .filter((e): e is Evidence => e != null);

    // icpFitRate: T2 lo estima desde el overlap de stack de la comunidad
    // (basis 'github'). T5 lo reemplaza por Terac cuando includeHumanValidation.
    const teracEvidence = citedEvidence.find((e) => e.source === 'terac');
    const humanValidated = Boolean(options.includeHumanValidation && teracEvidence);
    const icpFitRate = communityRes.breakdown.stackOverlap;
    const icpFitBasis = humanValidated ? 'terac' : icpFitRate != null ? 'github' : null;

    const expectedAttendance = event?.expectedAttendance ?? null;
    const tierPriceUsd = cheapestTierPrice(event);
    const roi = computeRoi({ tierPriceUsd, expectedAttendance, icpFitRate, icpFitBasis });

    const targetSize =
      expectedAttendance != null && icpFitRate != null
        ? Math.round(expectedAttendance * icpFitRate)
        : null;

    const score = Math.round((communityRes.score + bestTheme.result.score) / 2);

    const status: Status = humanValidated ? 'observed' : bestStatus(citedEvidence);
    const confidence =
      citedEvidence.length > 0
        ? Math.round(
            (citedEvidence.reduce((s, e) => s + clamp01(e.confidence), 0) /
              citedEvidence.length) *
              100,
          )
        : 0;

    const headline =
      roi.costPerQualifiedDev != null && roi.band
        ? `Co-host con ${community.name} · tema ${bestTheme.theme.label} · ~${
            targetSize ?? '?'
          } devs · est. $${roi.band[0]}–${roi.band[1]} por dev calificado`
        : `Co-crear con ${community.name} · tema ${bestTheme.theme.label} · audiencia a calificar · ROI ${roi.note}`;

    candidates.push({
      id: `opp-${community.id}-${bestTheme.theme.id}`,
      title: `${event ? 'Co-host con' : 'Co-crear con'} ${community.name}`,
      subtitle: `${bestTheme.theme.label} · ~${targetSize ?? '?'} devs`,
      lat: event?.lat ?? 37.7749,
      lng: event?.lng ?? -122.4194,
      play: {
        headline,
        communityId: community.id,
        themeId: bestTheme.theme.id,
        eventId: event?.id ?? null,
        audienceSpec: {
          targetSize,
          profile: request.icpStack.slice(0, 2),
          qualifier: null,
          teracNote: null,
        },
      },
      score,
      breakdown: { community: communityRes.breakdown, theme: bestTheme.result.breakdown },
      reasons,
      roi,
      confidence,
      status,
      humanValidated,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const opportunities = candidates.slice(0, 3);

  // Mapa de evidencia resuelto SOLO con lo citado por el top 3.
  const resolvedEvidence: Record<string, Evidence> = {};
  for (const opp of opportunities) {
    for (const id of collectCitedIds(opp.reasons)) {
      const e = evidenceById.get(id);
      if (e) resolvedEvidence[id] = e;
    }
  }

  const coverage: Coverage = {
    eventsEvaluated: graph.events.length,
    communitiesEvaluated: graph.communities.length,
    organizersEvaluated: graph.organizers.length,
    themesEvaluated: themes.length,
    sourcesUsed: [...sourcesUsed],
    sourcesFailed: [...sourcesFailed],
  };

  return {
    requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
    query: request,
    opportunities,
    evidence: resolvedEvidence,
    coverage,
    warnings,
    generatedAt: new Date().toISOString(),
    degraded: warnings.length > 0,
  };
}
