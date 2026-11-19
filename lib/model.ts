// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board. Those live-token protocols are also the model's teachers: they are the peer set.
//
// Implied value follows only from the snapshot's own figures (model "peer-multiple-2"):
//
//   peer ratio   = mcap_usd / tvl_usd for every tokenised protocol, clamped to [0.02, 10]
//   catMultiple  = median peer ratio of the protocol's own category, shrunk toward the global
//                  median with weight peers / (peers + 10); a category with no peers uses the
//                  global median outright. No protocol name is ever special-cased.
//   evidence     = a category priced off fewer than min_peers launches is a claim, not a market
//                  price, so its shrunk multiple is discounted: x (1 - 0.4 x (1 - peers/4)) -
//                  x0.70 for one peer, x0.80 for two, x0.90 for three, x1.00 from four up.
//                  Model 1 shrunk a one-peer median of 2.97x (a single $35M oracle token) only
//                  to 0.79x and let it price seven of the board's top ten; the discount is the
//                  price of thin evidence, applied to the number itself, not just a badge.
//   base         = tvl_usd x catMultiple x evidence
//   growth       = clamp(change_7d, -50, 80) per cent - one week of TVL flow is the noisiest
//                  figure in the snapshot (it contains a +4,448% print), so model 2 pays it
//                  less: growthMult = 1 + (growth / 100) x 0.35, a bonus of at most x1.28
//   growthMult   = 1 + (growth / 100) x 0.35
//   ageMult      = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365) - saturating:
//                  the factor stops growing at three years, however old the protocol is.
//   chainMult    = 1 + 0.02 x min(chains - 1, 5)            (at most 1.10, never dominant)
//   cap          = 2 x the largest tokenised peer market cap in the category, when that category
//                  has at least min_peers peers; otherwise 2 x the largest peer mcap overall
//   implied      = max(1, min(cap, round(base x growthMult x ageMult x chainMult)))
//
// Every row of board.json carries the full factor breakdown (peer multiple and where it came from,
// base value, growth, age, chain factor, cap), so the judge - and anyone else - can recompute the
// number from the snapshot alone and see exactly which factor moved it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  /** Peer mcap/TVL ratios are clamped into this band before any median is taken. */
  ratio_floor: number;
  ratio_cap: number;
  /** A category with at least this many tokenised peers is labelled a category estimate. */
  min_peers: number;
  /** Shrinkage weight: a category median is blended with the global median as peers/(peers+k). */
  shrink_k: number;
  /**
   * Thin-evidence discount: below min_peers, the shrunk multiple is multiplied by
   * 1 - thin_discount_max x (1 - peers/min_peers), so the thinnest category pays the most.
   */
  thin_discount_max: number;
  /** Peer multiple used only if the snapshot held no tokenised protocol at all. */
  fallback_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Age factor: floor + min(age, age_days_cap)/age_days_cap x range; unknown age uses unknown_age_days. */
  age_floor: number;
  age_range: number;
  age_days_cap: number;
  unknown_age_days: number;
  /** Chain breadth: chain_step per extra chain, counting at most chain_max_extra extra chains. */
  chain_step: number;
  chain_max_extra: number;
  /** Implied value cap: this factor x the largest tokenised peer mcap (category, else global). */
  cap_factor: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.02,
  ratio_cap: 10,
  min_peers: 4,
  shrink_k: 10,
  thin_discount_max: 0.4,
  fallback_multiple: 0.25,
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 80,
  age_floor: 0.6,
  age_range: 0.4,
  age_days_cap: 1095,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_extra: 5,
  cap_factor: 2,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'peer-multiple-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Where a row's peer multiple came from. */
export type PeerSource = 'category' | 'category-shrunk' | 'global';

/** A row's full factor breakdown: every input the implied value was built from. */
export interface FactorBreakdown {
  /** The peer multiple actually applied (kept under the starter's name too, for older readers). */
  base_multiple: number;
  peer_multiple: number;
  /** The category multiple after shrinkage but before the thin-evidence discount. */
  shrunk_multiple: number;
  /** The thin-evidence discount applied to the shrunk multiple (1 when the category has min_peers or more, or no peers at all). */
  evidence_factor: number;
  peer_source: PeerSource;
  /** Tokenised peers in the row's category (0 when the global median was used outright). */
  peer_count: number;
  /** The category's own median peer ratio before shrinkage; null when it has no peers. */
  category_median_multiple: number | null;
  /** The snapshot-wide median peer ratio. */
  global_median_multiple: number;
  /** tvl_usd x peer_multiple, before the growth, age and chain factors. */
  base_value_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  age_days: number | null;
  age_multiplier: number;
  /** Same number as age_multiplier, under the starter model's name. */
  maturity_multiplier: number;
  chain_count: number;
  chain_multiplier: number;
  /** The sanity cap applied to this row, and whether it bound. */
  cap_usd: number;
  capped: boolean;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: FactorBreakdown;
  farm_steps: string[];
}

/** The dashboard's view of one row: the board's own fields plus the full factor breakdown. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  /** True when the snapshot's watchlist carries this slug; false for an early-radar row. */
  watchlist: boolean;
  peer_multiple: number;
  /** The multiple after shrinkage, and the thin-evidence discount that produced the applied one. */
  shrunk_multiple: number;
  evidence_factor: number;
  peer_source: PeerSource;
  /** Tokenised peers behind the multiple, and the medians it was blended from (detail view). */
  peer_count: number;
  category_median_multiple: number | null;
  global_median_multiple: number;
  /** tvl_usd x peer_multiple, before the growth, age and chain factors. */
  base_value_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  age_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  /** The sanity cap applied to this row, and whether it bound. */
  cap_usd: number;
  capped: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  /** The snapshot-wide median peer ratio and how many tokenised protocols produced it. */
  peer_global_median: number;
  peer_protocols: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list, computed on a sorted copy (deterministic for any input order). */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** One category's peer set: how many tokenised peers, their median ratio, their largest market cap. */
export interface CategoryPeers {
  peers: number;
  medianMultiple: number;
  maxMcap: number;
}

/** The peer statistics the whole model runs on: global figures plus one entry per category. */
export interface PeerStats {
  globalMedian: number;
  globalMaxMcap: number;
  globalPeers: number;
  byCategory: Map<string | null, CategoryPeers>;
}

/** Whether a protocol can teach the model: it trades (not pre-token), is not an exchange, and carries a usable mcap and TVL. */
function isPeer(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/**
 * The peer statistics of one snapshot: for every category, the median mcap/TVL of its tokenised
 * protocols (ratios clamped to the model's band first, so one absurd print cannot move a median),
 * and the same figures across the whole snapshot. Computed once per board; purely a function of
 * the snapshot, so two runs over the same bytes agree exactly.
 */
export function peerStats(snapshot: Snapshot, model: ModelConstants = MODEL): PeerStats {
  const ratiosByCategory = new Map<string | null, number[]>();
  const maxByCategory = new Map<string | null, number>();
  const allRatios: number[] = [];
  let globalMaxMcap = 0;
  for (const p of snapshot.protocols) {
    if (!isPeer(p)) continue;
    const ratio = Math.min(model.ratio_cap, Math.max(model.ratio_floor, p.mcap_usd! / p.tvl_usd));
    allRatios.push(ratio);
    const list = ratiosByCategory.get(p.category) ?? [];
    list.push(ratio);
    ratiosByCategory.set(p.category, list);
    maxByCategory.set(p.category, Math.max(maxByCategory.get(p.category) ?? 0, p.mcap_usd!));
    globalMaxMcap = Math.max(globalMaxMcap, p.mcap_usd!);
  }
  const byCategory = new Map<string | null, CategoryPeers>();
  for (const [category, ratios] of ratiosByCategory) {
    byCategory.set(category, {
      peers: ratios.length,
      medianMultiple: median(ratios),
      maxMcap: maxByCategory.get(category) ?? 0,
    });
  }
  return {
    globalMedian: allRatios.length > 0 ? median(allRatios) : model.fallback_multiple,
    globalMaxMcap,
    globalPeers: allRatios.length,
    byCategory,
  };
}

/**
 * The peer multiple one category gets: its median, shrunk toward the global median by peer count,
 * then - while the category still has fewer than min_peers launches behind it - discounted for
 * thin evidence. Shrinkage alone left a one-peer category at 0.79x in model 1 (its single peer's
 * 2.97x ratio pulled the blend far above the 0.246x market median); the discount is what makes a
 * thin category's rows price like the unproven claims they are.
 */
export function multipleFor(stats: PeerStats, category: string | null, model: ModelConstants = MODEL): { multiple: number; shrunkMultiple: number; evidenceFactor: number; source: PeerSource; peers: number; categoryMedian: number | null; capBase: number } {
  const cat = stats.byCategory.get(category);
  if (cat === undefined || cat.peers === 0) {
    return { multiple: stats.globalMedian, shrunkMultiple: stats.globalMedian, evidenceFactor: 1, source: 'global', peers: 0, categoryMedian: null, capBase: stats.globalMaxMcap };
  }
  const w = cat.peers / (cat.peers + model.shrink_k);
  const shrunk = w * cat.medianMultiple + (1 - w) * stats.globalMedian;
  const evidenceFactor = cat.peers >= model.min_peers ? 1 : 1 - model.thin_discount_max * (1 - cat.peers / model.min_peers);
  return {
    multiple: shrunk * evidenceFactor,
    shrunkMultiple: shrunk,
    evidenceFactor,
    source: cat.peers >= model.min_peers ? 'category' : 'category-shrunk',
    peers: cat.peers,
    categoryMedian: cat.medianMultiple,
    // The cap is a sanity guard against absurd prints, not a ranking tool: only a category with
    // enough peers to trust may set the ceiling. A thin category (1-3 peers) falls back to the
    // global largest peer mcap, or its single small peer would flatten every big name in the
    // category to the same value and destroy the ranking it is meant to guard.
    capBase: cat.peers >= model.min_peers ? cat.maxMcap : stats.globalMaxMcap,
  };
}

/** The full scoring of one protocol: its implied value and the breakdown that produced it. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, stats: PeerStats, model: ModelConstants = MODEL): { implied: number; age: number | null; breakdown: FactorBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, shrunkMultiple, evidenceFactor, source, peers, categoryMedian, capBase } = multipleFor(stats, protocol.category, model);
  const baseValue = protocol.tvl_usd * multiple;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const ageMult = model.age_floor + (Math.min(Math.max(ageForModel, 0), model.age_days_cap) / model.age_days_cap) * model.age_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const cap = Math.max(1, Math.round(capBase * model.cap_factor));
  const raw = Math.round(baseValue * growthMult * ageMult * chainMult);
  const implied = Math.max(1, Math.min(cap, raw));
  const breakdown: FactorBreakdown = {
    base_multiple: round4(multiple),
    peer_multiple: round4(multiple),
    shrunk_multiple: round4(shrunkMultiple),
    evidence_factor: round4(evidenceFactor),
    peer_source: source,
    peer_count: peers,
    category_median_multiple: categoryMedian === null ? null : round4(categoryMedian),
    global_median_multiple: round4(stats.globalMedian),
    base_value_usd: Math.round(baseValue),
    growth_pct: growthPct,
    growth_multiplier: round4(growthMult),
    age_days: age,
    age_multiplier: round4(ageMult),
    maturity_multiplier: round4(ageMult),
    chain_count: protocol.chains.length,
    chain_multiplier: round4(chainMult),
    cap_usd: cap,
    capped: raw > cap,
  };
  return { implied, age, breakdown };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const stats = peerStats(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, age, breakdown } = impliedValue(p, snapshot.as_of, stats, model);
    return { p, implied, age, breakdown };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * (Carried over from the starter's shape; the value model above is this lane's replacement.)
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/**
 * A board row's form for data.js, carrying the row's own factor breakdown so the page renders the
 * model's numbers instead of recomputing them from one global multiple. Farm plans stay generated
 * in the page (the same derivation as farmSteps above), which keeps data.js compact.
 */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist,
    peer_multiple: row.model.peer_multiple,
    shrunk_multiple: row.model.shrunk_multiple,
    evidence_factor: row.model.evidence_factor,
    peer_source: row.model.peer_source,
    peer_count: row.model.peer_count,
    category_median_multiple: row.model.category_median_multiple,
    global_median_multiple: row.model.global_median_multiple,
    base_value_usd: row.model.base_value_usd,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    age_multiplier: row.model.age_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    cap_usd: row.model.cap_usd,
    capped: row.model.capped,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const stats = peerStats(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    peer_global_median: round4(stats.globalMedian),
    peer_protocols: stats.globalPeers,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
