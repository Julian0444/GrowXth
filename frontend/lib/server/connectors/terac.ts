// Conector Terac (entrevistas humanas). REGLA: no conocemos el SDK real de
// Terac (es de 2025). NO lo inventamos: interfaz + mock con la forma correcta +
// TODO(terac) donde va la llamada real.
//
// Sin TERAC_API_KEY, el mock lee data/seed/terac-study.json. Cada estudio se
// mapea a Evidence con kind 'human_interview', rightsBasis 'consented_panel',
// confidence 0.9 y status 'observed' — es evidencia consentida sobre el mundo.

import type { Evidence } from '@/lib/contracts/growxth';
import { readSeedArray } from '@/lib/server/graph/load-graph';

// Forma de un estudio Terac (nuestra interfaz, no la de Terac).
export interface TeracStudy {
  studyId: string;
  communityId: string; // a qué comunidad del grafo aplica
  icpFitRate: number; // fracción del panel que calza con el ICP (0..1)
  sampleSize: number;
  insight: string; // se muestra como teracNote
  observedAt: string;
  location: string;
  url?: string | null;
}

export interface TeracConnector {
  // Trae los estudios disponibles. Async: la API real lo es. Nunca lanza.
  getStudies(): Promise<TeracStudy[]>;
}

const SEED_FILE = 'terac-study.json';

// Lectura síncrona desde seed — la usa el pipeline (que es síncrono) cuando
// includeHumanValidation está activo.
export function loadTeracStudiesFromSeed(): TeracStudy[] {
  return readSeedArray<TeracStudy>(SEED_FILE);
}

// Mapea un estudio a Evidence. confidence FIJA en 0.9 (evidencia humana
// consentida). status 'observed' → hace que el badge pase Estimated→Observed.
export function teracStudyToEvidence(study: TeracStudy): Evidence {
  return {
    id: `ev-terac-${study.studyId}`,
    source: 'terac',
    kind: 'human_interview',
    url: study.url ?? null,
    title: `Terac — estudio ${study.studyId} (${study.sampleSize} entrevistas)`,
    observedAt: study.observedAt,
    location: study.location,
    confidence: 0.9,
    rightsBasis: 'consented_panel',
    status: 'observed',
    excerpt: study.insight.slice(0, 200),
  };
}

export const mockTerac: TeracConnector = {
  async getStudies(): Promise<TeracStudy[]> {
    const key = process.env.TERAC_API_KEY;
    if (!key) {
      // Sin API key: modo mock, leemos el estudio semilla.
      return loadTeracStudiesFromSeed();
    }
    // TODO(terac): reemplazar por la llamada real de Terac. Algo como:
    //   const res = await fetch("https://api.terac.com/v1/studies?location=san-francisco", {
    //     headers: { authorization: `Bearer ${key}` },
    //   })
    //   if (!res.ok) return []   // ningún conector lanza: falla → []
    //   const raw = await res.json()
    //   return raw.studies.map(mapTeracApiStudyToTeracStudy)
    // Pegá la firma exacta desde la doc real de Terac antes de escribir esto.
    return loadTeracStudiesFromSeed();
  },
};

export const terac: TeracConnector = mockTerac;
