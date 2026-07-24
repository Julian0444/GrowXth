// Resolución live-first del lado servidor: corre el pipeline y, si el grafo
// semilla todavía no tiene datos (0 oportunidades) o el pipeline falla, cae al
// fixture preparado marcando degraded. Lo usan la ruta de búsqueda y el webhook
// de Linq para no duplicar la lógica de fallback.

import type { SearchRequest, SearchResponse } from '@/lib/contracts/growxth';
import { getFixtureSearchResponse } from '@/lib/server/demo/fixtures';
import { searchOpportunities, type PipelineOptions } from '@/lib/server/pipeline/search-opportunities';

export function searchOrFixture(
  request: SearchRequest,
  options?: PipelineOptions,
): SearchResponse {
  try {
    const result = searchOpportunities(request, options);
    if (result.opportunities.length > 0) return result;
  } catch {
    // cae al fixture
  }
  const fixture = getFixtureSearchResponse();
  return {
    ...fixture,
    query: request,
    degraded: true,
    warnings: [...fixture.warnings, 'Grafo semilla vacío o pipeline caído; sirviendo fixture preparado.'],
  };
}
