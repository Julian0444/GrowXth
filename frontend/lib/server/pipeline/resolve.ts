// Resolución live-first del lado servidor (T2 + cierre T7): corre el pipeline
// y, si el grafo semilla no tiene datos (0 oportunidades) o el pipeline falla,
// cae al fixture preparado marcando degraded. Aplica cache en memoria (TTL 6h) y
// auditoría de labels, y chequea las env vars una vez. Lo usan la ruta de
// búsqueda y el webhook de Linq.

import type { SearchRequest, SearchResponse } from '@/lib/contracts/growxth';
import { getFixtureSearchResponse } from '@/lib/server/demo/fixtures';
import { auditResponse } from '@/lib/server/audit/labels';
import { SIX_HOURS_MS, TtlCache } from '@/lib/server/cache';
import { checkEnvOnce } from '@/lib/server/env';
import { searchOpportunities, type PipelineOptions } from '@/lib/server/pipeline/search-opportunities';

const cache = new TtlCache<SearchResponse>(SIX_HOURS_MS);

function cacheKey(request: SearchRequest, options?: PipelineOptions): string {
  return JSON.stringify({
    product: request.product,
    icpStack: request.icpStack,
    budgetUsd: request.budgetUsd,
    goal: request.goal,
    hv: Boolean(options?.includeHumanValidation),
  });
}

function fixtureFallback(request: SearchRequest): SearchResponse {
  const fixture = getFixtureSearchResponse();
  return {
    ...fixture,
    query: request,
    degraded: true,
    warnings: [...fixture.warnings, 'Grafo semilla vacío o pipeline caído; sirviendo fixture preparado.'],
  };
}

export function searchOrFixture(request: SearchRequest, options?: PipelineOptions): SearchResponse {
  checkEnvOnce();

  const key = cacheKey(request, options);
  const cached = cache.get(key);
  if (cached) return cached;

  let response: SearchResponse;
  try {
    const result = searchOpportunities(request, options);
    response = result.opportunities.length > 0 ? result : fixtureFallback(request);
  } catch {
    response = fixtureFallback(request);
  }

  const audited = auditResponse(response);
  cache.set(key, audited);
  return audited;
}
