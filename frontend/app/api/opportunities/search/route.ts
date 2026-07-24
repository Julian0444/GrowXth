// POST /api/opportunities/search → SearchResponse (contrato growxth.ts).
// Corre el pipeline sobre el grafo semilla. Si el grafo todavía no tiene datos
// (arrays vacíos) el pipeline devuelve 0 oportunidades; en ese caso servimos el
// fixture preparado marcado degraded, para que la demo siempre muestre 3.
// HTTP 200 siempre: el estado viaja en el body (degraded + warnings).

import { NextResponse } from 'next/server';

import type { SearchRequest, SearchResponse } from '@/lib/contracts/growxth';
import { getFixtureSearchResponse } from '@/lib/server/demo/fixtures';
import { searchOpportunities } from '@/lib/server/pipeline/search-opportunities';

const GOALS = new Set(['adoption', 'feedback', 'hiring', 'awareness']);

function parseRequest(body: unknown): SearchRequest {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const goal = typeof b.goal === 'string' && GOALS.has(b.goal) ? (b.goal as SearchRequest['goal']) : 'adoption';
  return {
    product: typeof b.product === 'string' ? b.product : '',
    icpStack: Array.isArray(b.icpStack) ? b.icpStack.filter((s): s is string => typeof s === 'string') : [],
    budgetUsd: typeof b.budgetUsd === 'number' && b.budgetUsd > 0 ? b.budgetUsd : 0,
    goal,
  };
}

export async function POST(request: Request): Promise<NextResponse<SearchResponse>> {
  let parsed: SearchRequest;
  try {
    parsed = parseRequest(await request.json());
  } catch {
    parsed = { product: '', icpStack: [], budgetUsd: 0, goal: 'adoption' };
  }

  let response: SearchResponse;
  try {
    response = searchOpportunities(parsed);
  } catch (err) {
    // El pipeline no debería lanzar, pero si lo hace: fixture degradado.
    const msg = err instanceof Error ? err.message : 'pipeline error';
    const fixture = getFixtureSearchResponse();
    return NextResponse.json({
      ...fixture,
      query: parsed,
      degraded: true,
      warnings: [...fixture.warnings, `Pipeline falló (${msg}); sirviendo fixture preparado.`],
    });
  }

  if (response.opportunities.length === 0) {
    const fixture = getFixtureSearchResponse();
    return NextResponse.json({
      ...fixture,
      query: parsed,
      degraded: true,
      warnings: [
        ...fixture.warnings,
        'El grafo semilla no tiene datos cargados; sirviendo fixture preparado.',
      ],
    });
  }

  return NextResponse.json(response);
}
