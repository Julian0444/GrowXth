// Contrato GrowXth — frontera entre backend y frontend.
// Solo tipos e interfaces: cero lógica, cero imports de runtime.
// Todo lo demás (scorers, pipeline, fixtures, cliente) importa de acá.

// ============ L0: grafo ============
export type Status = 'observed' | 'estimated' | 'prepared';

export interface SFEvent {
  id: string; name: string; url: string;
  startsAt: string | null; venueArea: string | null;
  lat: number; lng: number;
  expectedAttendance: number | null; attendanceBasis: Status;
  stack: string[]; communityIds: string[]; organizerIds: string[];
  sponsorTiers: { name: string; priceUsd: number | null }[];
  knownSponsors: string[]; pastThemes: string[];
  evidenceIds: string[];
}

export interface Community {
  id: string; name: string; url: string;
  kind: 'discord' | 'meetup-series' | 'university' | 'org' | 'slack';
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'irregular' | null;
  eventsRun12mo: number | null;        // corridos de verdad, no anunciados
  foundedYear: number | null;
  sizeEstimate: number | null; sizeBasis: Status;
  stack: string[]; organizerIds: string[];
  pastSponsors: string[];
  evidenceIds: string[];
}

// SOLO roles públicos. Nunca devs individuales.
export interface Organizer {
  id: string; displayName: string; publicRole: string;
  publicContactUrl: string | null;
  organizesEventIds: string[]; communityIds: string[];
  evidenceIds: string[];
}

export interface Theme {
  id: string; label: string;              // "local-first sync"
  githubMomentum: number | null;          // ratio 90d vs ventana previa
  newsSalience: number | null;
  saturationSF: number | null;            // eventos con este tema en 180d
  requiredCapabilities: string[];
  evidenceIds: string[];
}

// ============ L2: evidencia ============
export type EvidenceSource = 'exa' | 'luma' | 'github' | 'terac' | 'linq' | 'seed';
export type EvidenceKind =
  | 'web_page' | 'event_listing' | 'repo_activity'
  | 'human_interview' | 'human_confirmation' | 'prepared_fixture';
export type RightsBasis =
  | 'public_web' | 'public_api' | 'consented_panel'
  | 'direct_consent' | 'manual_curation';

export interface Evidence {
  id: string; source: EvidenceSource; kind: EvidenceKind;
  url: string | null; title: string; observedAt: string;
  location: string | null; confidence: number;
  rightsBasis: RightsBasis; status: Status;
  excerpt?: string;                       // máx ~200 chars
}

// ============ L4: request / response ============
export interface SearchRequest {
  product: string; icpStack: string[];
  budgetUsd: number;
  goal: 'adoption' | 'feedback' | 'hiring' | 'awareness';
}

export interface Reason { text: string; evidenceIds: string[]; }  // nunca vacío

export interface CommunityBreakdown {
  stackOverlap: number | null;        // .25
  cadenceReliability: number | null;  // .20
  access: number | null;              // .20
  exclusivityGap: number | null;      // .15
  durability: number | null;          // .10
  confidence: number | null;          // .10
}

export interface ThemeBreakdown {
  momentum: number | null;            // .30
  criticalPath: number | null;        // .30 — ¿el dev puede terminar sin tocar el producto?
  communityCapability: number | null; // .25
  saturationGap: number | null;       // .15
}

export interface AudienceSpec {
  targetSize: number | null;
  profile: string[];                  // ["Backend / Python", "2+ años"]
  qualifier: string | null;           // "al menos una integración de API en prod"
  teracNote: string | null;           // insight del estudio, si existe
}

export interface RoiEstimate {
  tierPriceUsd: number | null;
  expectedAttendance: number | null;
  icpFitRate: number | null;
  icpFitBasis: 'terac' | 'github' | 'prepared' | null;
  costPerQualifiedDev: number | null;
  band: [number, number] | null;
  note: string | null;                // "No disponible" si falta input
}

export interface Play {
  headline: string;                   // línea grande del drawer
  communityId: string;
  themeId: string;
  eventId: string | null;             // null = evento a co-crear
  audienceSpec: AudienceSpec;
}

// Nombre conservado a propósito: el frontend ya está construido contra Opportunity.
export interface Opportunity {
  id: string; title: string; subtitle: string;
  lat: number; lng: number;
  play: Play;
  score: number;                      // 0-100
  breakdown: { community: CommunityBreakdown; theme: ThemeBreakdown };
  reasons: Reason[];
  roi: RoiEstimate;
  confidence: number;                 // evidencia sobre el mundo
  status: Status;
  humanValidated: boolean;            // true solo con evidencia Terac
}

export interface Coverage {
  eventsEvaluated: number; communitiesEvaluated: number;
  organizersEvaluated: number; themesEvaluated: number;
  sourcesUsed: EvidenceSource[]; sourcesFailed: EvidenceSource[];
}

export interface SearchResponse {
  requestId: string; query: SearchRequest;
  opportunities: Opportunity[];       // top 3
  evidence: Record<string, Evidence>;
  coverage: Coverage;
  warnings: string[];
  generatedAt: string; degraded: boolean;
}

// ============ L5: Launch Room ============
export interface DecisionSignal {
  id: string;
  from: 'owner' | 'teammate' | 'organizer';
  type: 'approve' | 'reject' | 'request_evidence' | 'confirm_availability';
  payload?: { tierPriceUsd?: number; note?: string };
  receivedAt: string;
  becomesEvidence: boolean;           // true SOLO en confirm_availability de organizer
}

export interface Decision {
  id: string; opportunityId: string; threadId: string;
  participants: { role: 'owner' | 'teammate' | 'organizer'; consentAt: string }[];
  signals: DecisionSignal[];
  consensus: number;                  // 0-1 — alineación del equipo
  confidenceDelta: number;            // solo se mueve con becomesEvidence
  state: 'open' | 'approved' | 'rejected' | 'needs_evidence';
}
