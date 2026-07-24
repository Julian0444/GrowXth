import { createHash } from 'node:crypto';

import type {
  CampaignDraft,
  CommunityBreakdown,
  Evidence,
  EvidenceSource,
  MarketMomentumSignal,
  Opportunity,
  Reason,
  SearchRequest,
  SearchResponse,
  Status,
  ThemeBreakdown,
} from '../../contracts/growxth.ts';
import { runApifyActor, type ApifyActorResult } from '../connectors/apify.ts';
import { distanceMiles, requestCapabilities } from '../graph/derive-signals.ts';
import {
  MARKET_CITIES,
  cityForCountry,
  resolveMarketCity,
  type MarketCity,
} from '../markets/city-catalog.ts';
import { clamp01 } from '../scoring/score-utils.ts';

const GOOGLE_TRENDS_ACTOR = 'apify/google-trends-scraper';
const GITHUB_ACTOR = 'automation-lab/github-scraper';
const X_ACTOR = 'apidojo/tweet-scraper';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'build', 'building', 'by', 'company',
  'developers', 'developer', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'our',
  'platform', 'product', 'software', 'that', 'the', 'their', 'to', 'tool', 'tools',
  'we', 'with', 'una', 'para', 'por', 'que', 'los', 'las', 'del', 'de', 'un', 'y',
]);

interface TrendGeoSignal {
  city: MarketCity;
  value: number;
  basis: 'city' | 'country';
  geoLabel: string;
  url: string;
}

interface XGeoSignal {
  city: MarketCity;
  url: string;
  text: string;
  engagement: number;
  observedAt: string;
  basis: 'city' | 'profile_location';
}

interface GithubGeoSignal {
  city: MarketCity;
  repoName: string;
  repoUrl: string;
  profileUrl: string;
  location: string;
  stars: number;
  observedAt: string;
}

interface SourceState {
  source: 'google_trends' | 'github' | 'x';
  available: boolean;
  warning: string | null;
  globalCount: number;
  globalEvidenceUrl: string | null;
}

export interface GlobalSignalBundle {
  term: string;
  collectedAt: string;
  trends: TrendGeoSignal[];
  tweets: XGeoSignal[];
  github: GithubGeoSignal[];
  sources: SourceState[];
}

interface CityAccumulator {
  city: MarketCity;
  trends: TrendGeoSignal[];
  tweets: XGeoSignal[];
  github: GithubGeoSignal[];
  prepared: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'number' && Number.isFinite(item));
    return typeof first === 'number' ? first : null;
  }
  return null;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 12)}`;
}

function compact(value: string, max = 190): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function searchTermForRequest(request: SearchRequest): string {
  const tokens = request.product
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .match(/[a-z0-9+#.-]+/g)
    ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [];
  const unique = [...new Set(tokens)].slice(0, 5);
  if (unique.length > 0) return unique.join(' ');
  return requestCapabilities(request).slice(0, 3).join(' ') || 'developer tools';
}

function googleTrendsUrl(term: string): string {
  const params = new URLSearchParams({ date: 'today 3-m', q: term });
  return `https://trends.google.com/trends/explore?${params.toString()}`;
}

function rowsFromTrendItem(
  item: Record<string, unknown>,
): Array<{ row: Record<string, unknown>; basis: 'city' | 'country' }> {
  const groups: Array<{ key: string; basis: 'city' | 'country' }> = [
    { key: 'interestByCity', basis: 'city' },
    { key: 'interestByMetro', basis: 'city' },
    { key: 'interestBySubregion', basis: 'city' },
    { key: 'interestBy', basis: 'country' },
  ];
  for (const group of groups) {
    const value = item[group.key];
    if (Array.isArray(value) && value.length > 0) {
      return value
        .map(asRecord)
        .filter((row): row is Record<string, unknown> => row !== null)
        .map((row) => ({ row, basis: group.basis }));
    }
  }

  const dataType = asString(item.dataType)?.toLowerCase();
  if (dataType === 'geo' || dataType === 'interest_by_region') {
    return [{ row: item, basis: asString(item.city) ? 'city' : 'country' }];
  }
  return [];
}

export function normalizeGoogleTrends(
  result: ApifyActorResult,
  term: string,
): TrendGeoSignal[] {
  const normalized: TrendGeoSignal[] = [];
  for (const raw of result.items) {
    const item = asRecord(raw);
    if (!item) continue;
    for (const { row, basis } of rowsFromTrendItem(item)) {
      const geoName =
        asString(row.geoName) ??
        asString(row.regionName) ??
        asString(row.city) ??
        asString(row.country) ??
        asString(row.name);
      const geoCode =
        asString(row.geoCode) ?? asString(row.countryCode) ?? asString(row.regionCode);
      const value = asNumber(row.value) ?? asNumber(row.score) ?? asNumber(row.interest);
      if (!geoName || value == null || value <= 0) continue;
      const city =
        basis === 'country'
          ? cityForCountry(geoCode ?? geoName)
          : resolveMarketCity(`${geoName} ${geoCode ?? ''}`);
      if (!city) continue;
      normalized.push({
        city,
        value: Math.round(Math.max(0, Math.min(100, value))),
        basis,
        geoLabel: geoName,
        url: googleTrendsUrl(term),
      });
    }
  }
  return normalized;
}

function locationStrings(item: Record<string, unknown>): Array<{
  value: string;
  basis: 'city' | 'profile_location';
}> {
  const values: Array<{ value: string; basis: 'city' | 'profile_location' }> = [];
  const place = asRecord(item.place);
  for (const candidate of [
    place && asString(place.fullName),
    place && asString(place.name),
    place && asString(place.country),
  ]) {
    if (candidate) values.push({ value: candidate, basis: 'city' });
  }
  const author = asRecord(item.author);
  const authorLocation = author && asString(author.location);
  if (authorLocation) values.push({ value: authorLocation, basis: 'profile_location' });
  return values;
}

export function normalizeTweets(
  result: ApifyActorResult,
  collectedAt: string,
): XGeoSignal[] {
  const seen = new Set<string>();
  const normalized: XGeoSignal[] = [];
  for (const raw of result.items) {
    const item = asRecord(raw);
    if (!item || item.noResults === true) continue;
    const url = asString(item.url) ?? asString(item.twitterUrl);
    if (!url || seen.has(url)) continue;
    const match = locationStrings(item)
      .map((candidate) => ({ ...candidate, city: resolveMarketCity(candidate.value) }))
      .find((candidate) => candidate.city !== null);
    if (!match?.city) continue;
    seen.add(url);
    normalized.push({
      city: match.city,
      url,
      text: compact(asString(item.text) ?? 'Public X post about the searched topic.'),
      engagement:
        (asNumber(item.likeCount) ?? 0) +
        (asNumber(item.retweetCount) ?? 0) +
        (asNumber(item.replyCount) ?? 0) +
        (asNumber(item.quoteCount) ?? 0),
      observedAt: asString(item.createdAt) ?? collectedAt,
      basis: match.basis,
    });
  }
  return normalized;
}

interface GithubRepo {
  owner: string;
  name: string;
  url: string;
  stars: number;
  updatedAt: string;
}

function normalizeGithubRepos(items: unknown[], collectedAt: string): GithubRepo[] {
  return items.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const fullName = asString(item.fullName) ?? asString(item.name);
    const owner =
      asString(item.owner) ??
      (fullName?.includes('/') ? fullName.split('/')[0] ?? null : null);
    const url = asString(item.url) ?? asString(item.htmlUrl);
    if (!fullName || !owner || !url) return [];
    return [{
      owner,
      name: fullName,
      url,
      stars: Math.max(0, asNumber(item.stars) ?? 0),
      updatedAt: asString(item.updatedAt) ?? collectedAt,
    }];
  });
}

function normalizeGithubLocations(
  profileItems: unknown[],
  repos: GithubRepo[],
): GithubGeoSignal[] {
  const repoByOwner = new Map(repos.map((repo) => [repo.owner.toLowerCase(), repo]));
  return profileItems.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const username = asString(item.username) ?? asString(item.login);
    const location = asString(item.location);
    const profileUrl =
      asString(item.url) ?? (username ? `https://github.com/${encodeURIComponent(username)}` : null);
    const city = location ? resolveMarketCity(location) : null;
    const repo = username ? repoByOwner.get(username.toLowerCase()) : null;
    if (!username || !profileUrl || !location || !city || !repo) return [];
    return [{
      city,
      repoName: repo.name,
      repoUrl: repo.url,
      profileUrl,
      location,
      stars: repo.stars,
      observedAt: repo.updatedAt,
    }];
  });
}

async function collectGithub(term: string, collectedAt: string): Promise<{
  result: ApifyActorResult;
  locations: GithubGeoSignal[];
  repoCount: number;
  evidenceUrl: string | null;
}> {
  const result = await runApifyActor(
    GITHUB_ACTOR,
    { mode: 'search', searchQuery: term, maxResults: 10 },
    { waitSeconds: 18, timeoutSeconds: 45, maxItems: 10, maxTotalChargeUsd: 0.035 },
  );
  const repos = normalizeGithubRepos(result.items, collectedAt);
  if (repos.length === 0) {
    return { result, locations: [], repoCount: 0, evidenceUrl: null };
  }

  const urls = [...new Set(repos.map((repo) => `https://github.com/${repo.owner}`))].slice(0, 8);
  const profiles = await runApifyActor(
    GITHUB_ACTOR,
    { mode: 'profiles', urls, maxResults: urls.length },
    {
      waitSeconds: 10,
      timeoutSeconds: 30,
      maxItems: urls.length,
      maxTotalChargeUsd: 0.02,
    },
  );
  return {
    result:
      profiles.status === 'SUCCEEDED'
        ? result
        : { ...result, warning: profiles.warning ?? result.warning },
    locations: normalizeGithubLocations(profiles.items, repos),
    repoCount: repos.length,
    evidenceUrl: repos[0]?.url ?? null,
  };
}

export async function collectGlobalSignals(request: SearchRequest): Promise<GlobalSignalBundle> {
  const term = searchTermForRequest(request);
  const collectedAt = new Date().toISOString();
  const xQuery = `${term} -filter:retweets`;

  const [trendsResult, xResult, githubResult] = await Promise.all([
    runApifyActor(
      GOOGLE_TRENDS_ACTOR,
      {
        searchTerms: [term],
        timeRange: 'today 3-m',
        maxItems: 1,
        skipDebugScreen: true,
      },
      { waitSeconds: 24, timeoutSeconds: 55, maxItems: 1, maxTotalChargeUsd: 0.03 },
    ),
    runApifyActor(
      X_ACTOR,
      {
        searchTerms: [xQuery],
        sort: 'Latest',
        maxItems: 50,
        includeSearchTerms: true,
      },
      { waitSeconds: 30, timeoutSeconds: 55, maxItems: 50, maxTotalChargeUsd: 0.03 },
    ),
    collectGithub(term, collectedAt),
  ]);

  const trends = normalizeGoogleTrends(trendsResult, term);
  const tweets = normalizeTweets(xResult, collectedAt);
  const github = githubResult.locations;

  return {
    term,
    collectedAt,
    trends,
    tweets,
    github,
    sources: [
      {
        source: 'google_trends',
        available: trends.length > 0,
        warning:
          trends.length > 0
            ? null
            : trendsResult.warning ?? 'Google Trends returned no geographic rows.',
        globalCount: trends.length,
        globalEvidenceUrl: trends.length > 0 ? googleTrendsUrl(term) : null,
      },
      {
        source: 'github',
        available: githubResult.repoCount > 0,
        warning:
          githubResult.repoCount > 0
            ? github.length > 0
              ? null
              : 'GitHub returned relevant repositories but no resolvable public owner locations.'
            : githubResult.result.warning ?? 'GitHub returned no relevant repositories.',
        globalCount: githubResult.repoCount,
        globalEvidenceUrl: githubResult.evidenceUrl,
      },
      {
        source: 'x',
        available: tweets.length > 0,
        warning:
          tweets.length > 0
            ? null
            : xResult.warning ??
              'The X Actor returned no posts with an explicit resolvable location.',
        globalCount: tweets.length,
        globalEvidenceUrl: tweets[0]?.url ?? null,
      },
    ],
  };
}

function accumulatorFor(
  map: Map<string, CityAccumulator>,
  city: MarketCity,
): CityAccumulator {
  const current = map.get(city.id);
  if (current) return current;
  const next: CityAccumulator = {
    city,
    trends: [],
    tweets: [],
    github: [],
    prepared: false,
  };
  map.set(city.id, next);
  return next;
}

function evidenceStatus(items: Evidence[]): Status {
  if (items.some((item) => item.status === 'observed')) return 'observed';
  if (items.some((item) => item.status === 'estimated')) return 'estimated';
  return 'prepared';
}

function sourceSignal(
  source: MarketMomentumSignal['source'],
  label: string,
  value: number | null,
  displayValue: string,
  basis: MarketMomentumSignal['basis'],
  observedAt: string,
  evidenceIds: string[],
  available: boolean,
): MarketMomentumSignal {
  return {
    source,
    label,
    value,
    displayValue,
    basis,
    observedAt,
    evidenceIds,
    status: available ? (basis === 'city' ? 'observed' : 'estimated') : 'unavailable',
  };
}

function buildCampaign(
  request: SearchRequest,
  opportunityId: string,
  city: MarketCity,
  profile: string[],
): CampaignDraft {
  const product = compact(request.product || 'your developer product', 90);
  const audience = profile.slice(0, 2).join(' + ') || 'developers';
  return {
    id: `camp-${opportunityId}`,
    opportunityId,
    title: `${city.city} × ${product}`,
    variantA: compact(
      `Bring ${product} to ${city.city}: a hands-on session for ${audience} who want a workflow they can test the same day.`,
      320,
    ),
    variantB: compact(
      `Building with ${audience} in ${city.city}? Leave with one working ${product} playbook—not another product pitch.`,
      320,
    ),
  };
}

function scoreBreakdown(
  trend: number | null,
  x: number | null,
  github: number | null,
  confidence: number | null,
  combined: number,
): { community: CommunityBreakdown; theme: ThemeBreakdown } {
  return {
    community: {
      stackOverlap: github,
      cadenceReliability: null,
      access: x,
      exclusivityGap: null,
      durability: null,
      confidence,
    },
    theme: {
      momentum: combined,
      criticalPath: trend,
      communityCapability: github,
      saturationGap: null,
    },
  };
}

function selectGlobalTopThree(ranked: Opportunity[]): Opportunity[] {
  const selected: Opportunity[] = [];
  const countries = new Set<string>();
  for (const opportunity of ranked) {
    const code = opportunity.market?.countryCode ?? opportunity.market?.country ?? '';
    if (countries.has(code)) continue;
    selected.push(opportunity);
    countries.add(code);
    if (selected.length === 3) return selected;
  }
  for (const opportunity of ranked) {
    if (selected.some((item) => item.id === opportunity.id)) continue;
    selected.push(opportunity);
    if (selected.length === 3) break;
  }
  return selected;
}

export function rankGlobalMarkets(
  request: SearchRequest,
  bundle: GlobalSignalBundle,
): SearchResponse {
  const accumulators = new Map<string, CityAccumulator>();
  for (const trend of bundle.trends) accumulatorFor(accumulators, trend.city).trends.push(trend);
  for (const tweet of bundle.tweets) accumulatorFor(accumulators, tweet.city).tweets.push(tweet);
  for (const github of bundle.github) accumulatorFor(accumulators, github.city).github.push(github);

  const sortedPrepared = [...MARKET_CITIES].sort((a, b) => b.hubWeight - a.hubWeight);
  const representedCountries = new Set(
    [...accumulators.values()].map((item) => item.city.countryCode),
  );
  for (const city of sortedPrepared) {
    if (accumulators.size >= 8) break;
    if (representedCountries.has(city.countryCode)) continue;
    const accumulator = accumulatorFor(accumulators, city);
    accumulator.prepared = true;
    representedCountries.add(city.countryCode);
  }

  const maxTweetCount = Math.max(1, ...[...accumulators.values()].map((item) => item.tweets.length));
  const maxTweetEngagement = Math.max(
    1,
    ...[...accumulators.values()].map((item) =>
      item.tweets.reduce((sum, tweet) => sum + Math.log1p(tweet.engagement), 0),
    ),
  );
  const maxGithubCount = Math.max(1, ...[...accumulators.values()].map((item) => item.github.length));
  const maxGithubStars = Math.max(
    1,
    ...[...accumulators.values()].map((item) =>
      item.github.reduce((sum, repo) => sum + Math.log1p(repo.stars), 0),
    ),
  );
  const capabilities = requestCapabilities(request).slice(0, 3);
  const evidence: Record<string, Evidence> = {};

  const opportunities = [...accumulators.values()].map((accumulator): Opportunity => {
    const { city } = accumulator;
    const trendValue =
      accumulator.trends.length > 0
        ? Math.max(...accumulator.trends.map((item) => item.value)) / 100
        : null;
    const tweetEngagement = accumulator.tweets.reduce(
      (sum, item) => sum + Math.log1p(item.engagement),
      0,
    );
    const xValue =
      accumulator.tweets.length > 0
        ? clamp01(
            (accumulator.tweets.length / maxTweetCount) * 0.7 +
              (tweetEngagement / maxTweetEngagement) * 0.3,
          )
        : null;
    const githubStars = accumulator.github.reduce(
      (sum, item) => sum + Math.log1p(item.stars),
      0,
    );
    const githubValue =
      accumulator.github.length > 0
        ? clamp01(
            (accumulator.github.length / maxGithubCount) * 0.55 +
              (githubStars / maxGithubStars) * 0.45,
          )
        : null;

    const weighted = [
      { value: trendValue, weight: 0.55 },
      { value: xValue, weight: 0.25 },
      { value: githubValue, weight: 0.15 },
      { value: city.hubWeight, weight: 0.05 },
    ].filter((item): item is { value: number; weight: number } => item.value != null);
    const combined =
      weighted.reduce((sum, item) => sum + item.value * item.weight, 0) /
      weighted.reduce((sum, item) => sum + item.weight, 0);
    const hasLiveGeo =
      accumulator.trends.length + accumulator.tweets.length + accumulator.github.length > 0;
    const liveSourceWeight =
      (trendValue == null ? 0 : 0.55) +
      (xValue == null ? 0 : 0.25) +
      (githubValue == null ? 0 : 0.15);
    // A single estimated source can nominate a market, but cannot manufacture
    // a 90+ score. Coverage approaches 1 only when independent sources agree.
    const sourceCoverage = liveSourceWeight / 0.95;
    const calibrated = combined * (0.4 + sourceCoverage * 0.6);
    const score = hasLiveGeo
      ? Math.round(40 + calibrated * 55)
      : Math.round(28 + city.hubWeight * 12);

    const reasons: Reason[] = [];
    const cityEvidence: Evidence[] = [];
    const trendIds = accumulator.trends.slice(0, 2).map((item) => {
      const id = stableId('ev-trends', `${bundle.term}:${city.id}:${item.geoLabel}`);
      evidence[id] = {
        id,
        source: 'google_trends',
        kind: 'search_trend',
        url: item.url,
        title: `Google Trends · ${item.geoLabel}`,
        observedAt: bundle.collectedAt,
        location: item.geoLabel,
        confidence: item.basis === 'city' ? 0.9 : 0.72,
        rightsBasis: 'public_web',
        status: item.basis === 'city' ? 'observed' : 'estimated',
        collector: 'apify',
        excerpt: `${bundle.term}: ${item.value}/100 relative search interest over the selected window.`,
      };
      cityEvidence.push(evidence[id]);
      return id;
    });
    if (trendIds.length > 0) {
      const best = Math.max(...accumulator.trends.map((item) => item.value));
      const basis = accumulator.trends.some((item) => item.basis === 'city')
        ? city.city
        : city.country;
      reasons.push({
        text: `Google Trends shows ${best}/100 relative interest for “${bundle.term}” in ${basis}.`,
        evidenceIds: trendIds,
      });
    }

    const tweetIds = accumulator.tweets.slice(0, 3).map((item) => {
      const id = stableId('ev-x', item.url);
      evidence[id] = {
        id,
        source: 'x',
        kind: 'social_post',
        url: item.url,
        title: `Public X signal · ${city.city}`,
        observedAt: item.observedAt,
        location: city.city,
        confidence: item.basis === 'city' ? 0.8 : 0.55,
        rightsBasis: 'public_web',
        status: item.basis === 'city' ? 'observed' : 'estimated',
        collector: 'apify',
        excerpt: item.text,
      };
      cityEvidence.push(evidence[id]);
      return id;
    });
    if (tweetIds.length > 0) {
      reasons.push({
        text: `${accumulator.tweets.length} public X post${
          accumulator.tweets.length === 1 ? '' : 's'
        } about “${bundle.term}” include an explicit location matching ${city.city}.`,
        evidenceIds: tweetIds,
      });
    }

    const githubIds = accumulator.github.slice(0, 3).map((item) => {
      const id = stableId('ev-github', `${item.profileUrl}:${item.repoName}`);
      evidence[id] = {
        id,
        source: 'github',
        kind: 'repo_activity',
        url: item.profileUrl,
        title: `${item.repoName} · public owner location`,
        observedAt: item.observedAt,
        location: item.location,
        confidence: 0.55,
        rightsBasis: 'public_api',
        status: 'estimated',
        collector: 'apify',
        excerpt: `A relevant public repository owner lists “${item.location}”. This is a supply-side signal, not a user count.`,
      };
      cityEvidence.push(evidence[id]);
      return id;
    });
    if (githubIds.length > 0) {
      reasons.push({
        text: `${accumulator.github.length} owner${
          accumulator.github.length === 1 ? '' : 's'
        } of relevant GitHub repositories publicly list ${city.city} or its region.`,
        evidenceIds: githubIds,
      });
    }

    if (reasons.length === 0) {
      const id = `ev-prepared-${city.id}`;
      evidence[id] = {
        id,
        source: 'seed',
        kind: 'prepared_fixture',
        url: null,
        title: `${city.city} developer-hub baseline`,
        observedAt: bundle.collectedAt,
        location: `${city.city}, ${city.country}`,
        confidence: 0.3,
        rightsBasis: 'manual_curation',
        status: 'prepared',
        collector: 'prepared',
        excerpt: 'Prepared fallback used only when live providers do not cover enough distinct markets.',
      };
      cityEvidence.push(evidence[id]);
      reasons.push({
        text: `${city.city} remains a prepared developer-hub candidate while live geographic evidence is incomplete.`,
        evidenceIds: [id],
      });
    }

    const avgConfidence =
      cityEvidence.reduce((sum, item) => sum + item.confidence, 0) /
      Math.max(1, cityEvidence.length);
    const sourceCount = [trendValue, xValue, githubValue].filter((value) => value != null).length;
    const confidence = hasLiveGeo
      ? Math.round(Math.min(92, avgConfidence * 70 + (sourceCount / 3) * 25))
      : 30;
    const trendBasis = accumulator.trends.some((item) => item.basis === 'city')
      ? 'city'
      : 'country';
    const sourceMap = new Map(bundle.sources.map((source) => [source.source, source]));
    const momentumSignals: MarketMomentumSignal[] = [
      sourceSignal(
        'google_trends',
        'Search interest',
        trendValue == null ? null : Math.round(trendValue * 100),
        trendValue == null ? 'No geographic result' : `${Math.round(trendValue * 100)}/100`,
        trendBasis,
        bundle.collectedAt,
        trendIds,
        trendValue != null,
      ),
      sourceSignal(
        'github',
        'Technical activity',
        githubValue == null ? null : Math.round(githubValue * 100),
        accumulator.github.length > 0
          ? `${accumulator.github.length} located repo owner${
              accumulator.github.length === 1 ? '' : 's'
            }`
          : `${sourceMap.get('github')?.globalCount ?? 0} relevant repos globally`,
        accumulator.github.length > 0 ? 'profile_location' : 'global',
        bundle.collectedAt,
        githubIds,
        (sourceMap.get('github')?.globalCount ?? 0) > 0,
      ),
      sourceSignal(
        'x',
        'Developer conversation',
        xValue == null ? null : Math.round(xValue * 100),
        accumulator.tweets.length > 0
          ? `${accumulator.tweets.length} location-matched post${
              accumulator.tweets.length === 1 ? '' : 's'
            }`
          : 'No location-matched posts',
        accumulator.tweets.some((item) => item.basis === 'city') ? 'city' : 'profile_location',
        bundle.collectedAt,
        tweetIds,
        accumulator.tweets.length > 0,
      ),
    ];

    const distance =
      request.location != null
        ? distanceMiles(
            { lat: request.location.lat, lng: request.location.lng },
            { lat: city.lat, lng: city.lng },
          )
        : null;
    const id = `opp-global-${city.id}`;
    const leadingReason = reasons[0]?.text ?? `Developer demand signal in ${city.city}.`;

    return {
      id,
      title: `${city.city} developer market`,
      subtitle: `${city.city} · ${city.country}`,
      lat: city.lat,
      lng: city.lng,
      play: {
        headline: `Test a developer activation in ${city.city} · ${compact(leadingReason, 120)}`,
        communityId: `market-${city.id}`,
        themeId: `theme-${stableId('global', bundle.term)}`,
        eventId: null,
        audienceSpec: {
          targetSize: null,
          profile: capabilities,
          qualifier: 'Query-matched developers; exact audience size requires campaign instrumentation',
          teracNote: null,
        },
      },
      score,
      breakdown: scoreBreakdown(
        trendValue,
        xValue,
        githubValue,
        avgConfidence,
        combined,
      ),
      reasons,
      roi: {
        tierPriceUsd: null,
        expectedAttendance: null,
        icpFitRate: null,
        icpFitBasis: null,
        costPerQualifiedDev: null,
        band: null,
        note: 'Pricing not collected',
      },
      confidence,
      status: evidenceStatus(cityEvidence),
      humanValidated: false,
      distanceMiles: distance == null ? null : Math.round(distance * 10) / 10,
      market: {
        city: city.city,
        country: city.country,
        countryCode: city.countryCode,
      },
      momentumSignals,
      event: null,
      campaign: buildCampaign(request, id, city, capabilities),
    };
  });

  opportunities.sort((a, b) => {
    if (
      request.location &&
      a.distanceMiles != null &&
      b.distanceMiles != null &&
      Math.abs(a.score - b.score) <= 5
    ) {
      return a.distanceMiles - b.distanceMiles;
    }
    return b.score - a.score;
  });
  // Rank is attached by the legacy adapter; array order is canonical here.
  const top = selectGlobalTopThree(opportunities).map((opportunity) => ({
    ...opportunity,
    score: Math.max(0, Math.min(100, opportunity.score)),
  }));

  const resolvedEvidence: Record<string, Evidence> = {};
  for (const opportunity of top) {
    const ids = new Set([
      ...opportunity.reasons.flatMap((reason) => reason.evidenceIds),
      ...(opportunity.momentumSignals ?? []).flatMap((signal) => signal.evidenceIds),
    ]);
    for (const id of ids) {
      if (evidence[id]) resolvedEvidence[id] = evidence[id];
    }
  }

  const sourcesUsed = bundle.sources
    .filter((source) => source.available)
    .map((source) => source.source as EvidenceSource);
  const sourcesFailed = bundle.sources
    .filter((source) => !source.available)
    .map((source) => source.source as EvidenceSource);
  const warnings = bundle.sources.flatMap((source) =>
    source.warning ? [`${source.source}: ${source.warning}`] : [],
  );
  if (top.some((item) => item.status === 'prepared')) {
    warnings.push(
      'Prepared developer hubs fill uncovered markets; they are labeled and never presented as observed demand.',
    );
  }
  if (request.location) {
    warnings.push(
      'Shared location is used only as a tie-breaker; it never changes the market score.',
    );
  }

  return {
    requestId: `req-global-${crypto.randomUUID().slice(0, 8)}`,
    query: request,
    opportunities: top,
    evidence: resolvedEvidence,
    coverage: {
      eventsEvaluated: 0,
      communitiesEvaluated: 0,
      organizersEvaluated: 0,
      themesEvaluated: opportunities.length,
      sourcesUsed,
      sourcesFailed,
    },
    warnings,
    generatedAt: bundle.collectedAt,
    degraded: sourcesFailed.length > 0 || top.some((item) => item.status === 'prepared'),
    locationContext: request.location
      ? {
          source: request.location.source,
          lat: request.location.lat,
          lng: request.location.lng,
          locality: request.location.locality ?? null,
          updatedAt: request.location.updatedAt ?? null,
          scorePolicy: 'tie_break_only',
        }
      : null,
  };
}

export async function searchGlobalMarkets(request: SearchRequest): Promise<SearchResponse> {
  const bundle = await collectGlobalSignals(request);
  return rankGlobalMarkets(request, bundle);
}
