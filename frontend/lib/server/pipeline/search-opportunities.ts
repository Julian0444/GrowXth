// Pipeline de búsqueda (T2 + enganche Terac de T5). Orquesta grafo semilla +
// scorers puros + ROI y arma el SearchResponse. Presupuesto total 8s con
// degradación parcial: si un paso se pasa del deadline, se salta con warning.
//
// Con grafo vacío devuelve opportunities: []. La ruta decide el fallback al
// fixture — el pipeline nunca inventa datos.
//
// includeHumanValidation (T5): cuando es true, inyecta la evidencia de Terac,
// icpFitRate pasa a venir del estudio (basis 'terac'), humanValidated true y el
// status de la oportunidad pasa Estimated → Observed.

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
  loadCommunityEvidence,
  loadEvidence,
  loadGraph,
  loadThemes,
  type SeedGraph,
} from '@/lib/server/graph/load-graph';
import {
  loadTeracStudiesFromSeed,
  teracStudyToEvidence,
  type TeracStudy,
} from '@/lib/server/connectors/terac';
import { scoreCommunity } from '@/lib/server/scoring/community-score';
import { scoreTheme } from '@/lib/server/scoring/theme-score';
import { computeRoi } from '@/lib/server/scoring/roi';
import { clamp01 } from '@/lib/server/scoring/score-utils';

export interface PipelineDeps {
  graph: SeedGraph;
  themes: Theme[];
  evidence: Evidence[];
  communityEvidence: Record<string, Evidence[]>;
}

export interface PipelineOptions {
  budgetMs?: number;
  includeHumanValidation?: boolean;
  teracStudies?: TeracStudy[]; // inyectable para tests; por defecto lee seed
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
    communityEvidence: deps?.communityEvidence ?? loadCommunityEvidence(),
  };
}

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

  const deps = loadDeps(options.deps);
  const { graph, themes, communityEvidence } = deps;
  const evidence: Evidence[] = [...deps.evidence];

  // ---- Enganche Terac (T5) ----
  const studyByCommunity = new Map<string, TeracStudy>();
  if (options.includeHumanValidation) {
    try {
      const studies = options.teracStudies ?? loadTeracStudiesFromSeed();
      for (const study of studies) {
        studyByCommunity.set(study.communityId, study);
        evidence.push(teracStudyToEvidence(study));
      }
    } catch {
      sourcesFailed.add('terac'); // ningún conector lanza hacia afuera
    }
  }

  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  for (const e of evidence) sourcesUsed.add(e.source);

  const candidates: Opportunity[] = [];

  for (const community of graph.communities) {
    if (deadlineHit()) {
      warnings.push('Se alcanzó el presupuesto de 8s; ranking parcial.');
      break;
    }
    if (themes.length === 0) break;

    // Tema mejor punteado para esta comunidad.
    let bestTheme: { theme: Theme; result: ReturnType<typeof scoreTheme> } | null = null;
    for (const theme of themes) {
      const result = scoreTheme({ theme, community, evidence, request });
      if (!bestTheme || result.score > bestTheme.result.score) {
        bestTheme = { theme, result };
      }
    }
    if (!bestTheme) continue;

    const study = studyByCommunity.get(community.id) ?? null;
    const humanValidated = Boolean(options.includeHumanValidation && study);
    const teracEv = study ? evidenceById.get(`ev-terac-${study.studyId}`) ?? null : null;

    // Evidencia web de Exa para esta comunidad (opcional). Se suma al pool.
    const exaEv = communityEvidence[community.id] ?? [];
    for (const e of exaEv) {
      if (!evidenceById.has(e.id)) {
        evidence.push(e);
        evidenceById.set(e.id, e);
        sourcesUsed.add(e.source);
      }
    }

    // Aumentamos los evidenceIds de la comunidad (Terac + Exa) para que su
    // confidence los incluya.
    const extraIds = [...(teracEv ? [teracEv.id] : []), ...exaEv.map((e) => e.id)];
    const scoringCommunity = extraIds.length
      ? { ...community, evidenceIds: [...community.evidenceIds, ...extraIds] }
      : community;
    const communityRes = scoreCommunity({ community: scoringCommunity, evidence, request });

    const event = graph.events.find((e) => e.communityIds.includes(community.id)) ?? null;

    const reasons: Reason[] = [...communityRes.reasons, ...bestTheme.result.reasons];
    if (teracEv && study) {
      reasons.unshift({
        text: `Validación humana (Terac): ${study.insight}`,
        evidenceIds: [teracEv.id],
      });
    }
    // Exa: completa los evidenceIds de la oportunidad con cobertura web.
    if (exaEv.length > 0) {
      reasons.push({
        text: `Cobertura web relevante (Exa): ${exaEv.length} fuente(s).`,
        evidenceIds: exaEv.map((e) => e.id),
      });
    }
    // Regla dura: toda oportunidad devuelta tiene ≥1 reason con evidencia.
    if (reasons.length === 0) continue;

    const citedIds = collectCitedIds(reasons);
    const citedEvidence = citedIds
      .map((id) => evidenceById.get(id))
      .filter((e): e is Evidence => e != null);

    // icpFitRate: con validación humana viene de Terac; si no, del overlap de
    // stack de la comunidad (basis 'github').
    const icpFitRate = humanValidated && study ? study.icpFitRate : communityRes.breakdown.stackOverlap;
    const icpFitBasis: Opportunity['roi']['icpFitBasis'] = humanValidated
      ? 'terac'
      : icpFitRate != null
        ? 'github'
        : null;

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
          teracNote: study ? study.insight : null,
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
