// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// Model "fitted-comps-1" replaces the category-median multiples of peer-multiple-1/2. Those
// medians are the flat baseline this model's own backtest beats: priced blind, one flat
// multiple of TVL misses a traded token's real cap by x4.51 (median, leave-one-out over the
// comparables), while the fitted curve below misses by x3.27. The model is:
//
//   selectUniverse  every protocol in the snapshot is accounted for exactly once. The board
//                   ranks the stand-alone protocols that record no token (197 on the sealed
//                   snapshot); the comparables ("comps") are the stand-alone protocols whose
//                   token trades with a live market cap (92). Bridges, staking forms,
//                   exchange custody, versioned releases and wrapped-or-staked names are set
//                   aside with their counts printed, never silently dropped. A protocol
//                   whose record shows a market cap of zero or less records a token but has
//                   no live cap: it sits with "token on record, no cap", never with comps.
//   fitCurve        log10(market cap) = a + b x log10(forward TVL), an ordinary least
//                   squares line over the comps. Ten times the TVL buys about 2.4 times the
//                   value (b ~ 0.39), not ten times. A Huber-robust refit was tested and
//                   not kept: it widened the held-out miss (x3.43 against x3.27).
//   growth carry    forward TVL = TVL x (1 + excess 7d)^gamma, gamma 0.42, the excess being
//                   the protocol's 7-day change less the comps' median change, clamped to
//                   +/-60 points. One week of flow is the snapshot's noisiest figure, so it
//                   moves the value being priced, bounded, never the price directly.
//   familyPremium   each family's traded tokens sit a median ratio above or below the
//                   curve; that ratio, shrunk toward 1 by n/(n+8), multiplies the curve's
//                   value. Families group DefiLlama's categories so a premium rests on
//                   4-27 launches, never on one. (Raw per-category premiums were tested:
//                   x3.57 held out - worse than the curve alone - so they are not used.)
//   launchOdds      the chance a launch is still to come, from the snapshot's own ages:
//                   the share of protocols recording a token rises with tracked age toward
//                   an ever-rate E (0.80 among the oldest cohort); a category's E is its own
//                   rate corrected for its age mix, and the odds are the survival form
//                   E(1-F(age)) / (1 - E x F(age)). Age inside the price itself was tested
//                   and rejected by the blind test (x3.36 against x3.23): age prices the
//                   odds, not the value.
//   implied value   the value if it launches: curve x premium, on forward TVL. It is NOT
//                   multiplied by the odds; the odds price the farm maths below, where a
//                   probability belongs.
//   bands           each row's P25-P75 range is the leave-one-out residual band of the
//                   fitted model itself (x0.28 to x3.14), and its rank range is where the
//                   row lands when its value moves across that band. The bands' honesty is
//                   measured, not asserted: fitted on the oldest half of the comps, they
//                   caught the real caps of the newer half at the rates printed in the
//                   backtest block.
//
//   farmPlan        a stated 8% of the launch value is the farmers' drop; a deposit sized
//                   to the protocol (TVL x 1e-5, $250 to $25,000) earns its pro-rata slice
//                   of that drop, times the launch odds. Against it stand the plan's own
//                   fees, totalled in dollars from the chain's gas tier, and a 4% T-bill
//                   opportunity cost on the deposit for the hold. Net, break-even odds
//                   and a verdict follow: FARM when the net is at least +$5, MARGINAL
//                   when it is within $5 either way, SKIP beyond that. The position may
//                   earn the protocol's own yield, which would offset the opportunity
//                   cost; the snapshot does not carry yields, so none is assumed.
//
// Every figure is a function of the snapshot alone: no name is special-cased, no clock is
// read, and two runs over the same bytes agree exactly. board.json carries each row's full
// breakdown, so anyone can recompute the board from the snapshot and this file.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Growth carry: forward TVL = TVL x (1 + excess)^gamma, excess clamped to +/- this many points. */
  growth_gamma: number;
  growth_excess_clamp: number;
  /** Family premium shrinkage: a family's raw premium is blended toward 1 by n/(n+k). */
  premium_shrink_k: number;
  /** Launch odds are clamped into this band. */
  odds_floor: number;
  odds_cap: number;
  /** The farmers' assumed share of a launch's value, and the risk-free rate charged against a deposit. */
  drop_share: number;
  risk_free_rate: number;
  /** Farm deposit: TVL x this share, clamped into [deposit_min, deposit_max]. */
  deposit_tvl_share: number;
  deposit_min: number;
  deposit_max: number;
  /** Verdict thresholds on the plan's net: FARM at or above farm_net, MARGINAL at or above marginal_net. */
  farm_net: number;
  marginal_net: number;
}

export const MODEL: ModelConstants = {
  growth_gamma: 0.42,
  growth_excess_clamp: 60,
  premium_shrink_k: 8,
  odds_floor: 0.1,
  odds_cap: 0.95,
  drop_share: 0.08,
  risk_free_rate: 0.04,
  deposit_tvl_share: 0.00001,
  deposit_min: 250,
  deposit_max: 25000,
  farm_net: 5,
  marginal_net: -5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'fitted-comps-2';

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list, computed on a sorted copy (deterministic for any input order). */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The q-quantile of a non-empty list, linearly interpolated on a sorted copy. */
function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

// ---------------------------------------------------------------- the universe

/** Category families: premiums are fitted per family so each rests on several launches. */
const FAMILY_OF = new Map<string, string>([
  ...['Lending', 'CDP', 'Collateral Management', 'Leveraged Farming', 'DOR'].map((c): [string, string] => [c, 'Lending & credit']),
  ...['Dexs', 'Derivatives', 'Options', 'Options Vault', 'Prediction Market', 'Basis Trading', 'OTC Marketplace'].map((c): [string, string] => [c, 'Trading venues']),
  ...['Yield', 'Yield Aggregator', 'Risk Curators', 'Onchain Capital Allocator', 'Liquidity Manager', 'Farm', 'Indexes', 'Liquidity Hub'].map((c): [string, string] => [c, 'Vaults & yield']),
  ...['RWA', 'Dual-Token Stablecoin', 'Token Locker'].map((c): [string, string] => [c, 'RWA & stables']),
  ...['Staking Pool', 'Restaking'].map((c): [string, string] => [c, 'Staking & restaking']),
  ...['Chain', 'Privacy', 'Payments', 'Launchpad', 'Governance Incentives', 'Cross Chain Bridge', 'Bridge'].map((c): [string, string] => [c, 'Chains & infra']),
  ...['Decentralized AI', 'AI Agents', 'NFT Marketplace'].map((c): [string, string] => [c, 'AI, NFTs & other']),
]);

/** The family a protocol's category belongs to; unmapped and null categories share the last family. */
export function familyOf(p: SnapshotProtocol): string {
  return (p.category !== null ? FAMILY_OF.get(p.category) : undefined) ?? 'AI, NFTs & other';
}

const BRIDGE_CATS = new Set(['Bridge', 'Canonical Bridge']);
const STAKING_CATS = new Set(['Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
/** DefiLlama's version-marker rule, plus the no-space form ("CommunityV3") the marker also takes. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$|(V\d+|v\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Why a protocol is set aside, or null when it stands alone. The order is the accounting's order. */
export function asideReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && BRIDGE_CATS.has(p.category)) return 'bridge';
  if (p.category !== null && STAKING_CATS.has(p.category)) return 'staking';
  if (p.category === 'CEX') return 'custody';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped';
  return null;
}

/** Whether a protocol records a token at all (a CoinGecko id or a symbol, cap or no cap). */
export function recordsToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** One accounting bucket: every protocol in the snapshot lands in exactly one. */
export interface UniverseBucket {
  key: string;
  label: string;
  count: number;
}

/** The universe, divided: what the board ranks, what teaches it, and what is set aside and why. */
export interface Universe {
  total: number;
  /** Stand-alone protocols recording no token: the board's rows, before scoring. */
  ranked: SnapshotProtocol[];
  /** Stand-alone protocols whose token trades with a live cap: the model's teachers. */
  comps: SnapshotProtocol[];
  /** Every protocol with a live market cap, stand-alone or not (the dashboard's traded view). */
  trades: SnapshotProtocol[];
  buckets: UniverseBucket[];
}

const BUCKET_LABELS: Record<string, string> = {
  ranked: 'ranked here: record no token and stand alone',
  trades: 'already trade: a token with a live market cap',
  record: 'a token on record, no live market cap',
  bridge: 'bridges: another token carried across',
  staking: 'liquid staking and restaking: a staked form of a token that trades',
  custody: 'exchange custody: nothing to farm',
  versioned: 'versioned releases of one protocol',
  wrapped: 'wrapped or staked by name',
};

/** Divide the snapshot's protocols into the board, the comps, and the set-asides, each counted once. */
export function selectUniverse(snapshot: Snapshot): Universe {
  const counts = new Map<string, number>();
  const bump = (key: string): void => { counts.set(key, (counts.get(key) ?? 0) + 1); };
  const ranked: SnapshotProtocol[] = [];
  const comps: SnapshotProtocol[] = [];
  const trades: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0) {
      trades.push(p);
      bump('trades');
      if (asideReason(p) === null) comps.push(p);
      continue;
    }
    if (recordsToken(p)) {
      bump('record');
      continue;
    }
    const reason = asideReason(p);
    if (reason !== null) {
      bump(reason);
      continue;
    }
    ranked.push(p);
    bump('ranked');
  }
  const order = ['ranked', 'trades', 'record', 'bridge', 'staking', 'custody', 'versioned', 'wrapped'];
  const buckets = order
    .filter((key) => (counts.get(key) ?? 0) > 0)
    .map((key) => ({ key, label: BUCKET_LABELS[key]!, count: counts.get(key)! }));
  return { total: snapshot.protocols.length, ranked, comps, trades, buckets };
}

// ---------------------------------------------------------------- the fit

/** A fitted size curve: log10(market cap) = a + b x log10(forward TVL). */
export interface CurveFit {
  a: number;
  b: number;
}

/** The comps' median 7-day change: the market's own week, which a protocol's excess is measured against. */
export function medianCompChange(comps: SnapshotProtocol[]): number {
  return comps.length > 0 ? median(comps.map((p) => finite(p.change_7d, 0))) : 0;
}

/** The TVL the curve prices: the protocol's own TVL carried one week forward by its excess move. */
export function forwardTvl(p: SnapshotProtocol, medChange: number, model: ModelConstants = MODEL): number {
  const excess = clamp(finite(p.change_7d, 0) - medChange, -model.growth_excess_clamp, model.growth_excess_clamp);
  return p.tvl_usd * Math.pow(1 + excess / 100, model.growth_gamma);
}

/** Ordinary least squares for y = a + b x. */
function ols(xs: number[], ys: number[]): CurveFit {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/** Fit the size curve on a set of comps (each with a live cap and a positive TVL). */
export function fitCurve(comps: SnapshotProtocol[], medChange: number, model: ModelConstants = MODEL): CurveFit {
  return ols(
    comps.map((p) => Math.log10(forwardTvl(p, medChange, model))),
    comps.map((p) => Math.log10(p.mcap_usd!)),
  );
}

/** One family's premium: the median ratio of its comps' real caps to the curve, shrunk toward 1. */
export interface FamilyPremium {
  family: string;
  peers: number;
  raw: number;
  adj: number;
}

/** Every family's premium over a comp set, fitted against a given curve. */
export function familyPremiums(comps: SnapshotProtocol[], curve: CurveFit, medChange: number, model: ModelConstants = MODEL): Map<string, FamilyPremium> {
  const ratios = new Map<string, number[]>();
  for (const p of comps) {
    const predicted = Math.pow(10, curve.a + curve.b * Math.log10(forwardTvl(p, medChange, model)));
    const list = ratios.get(familyOf(p)) ?? [];
    list.push(p.mcap_usd! / predicted);
    ratios.set(familyOf(p), list);
  }
  const out = new Map<string, FamilyPremium>();
  for (const [family, list] of ratios) {
    const raw = median(list);
    out.set(family, { family, peers: list.length, raw, adj: 1 + (raw - 1) * (list.length / (list.length + model.premium_shrink_k)) });
  }
  return out;
}

/** The whole fitted model over one comp set: curve, premiums, and the median change they share. */
export interface FittedModel {
  curve: CurveFit;
  premiums: Map<string, FamilyPremium>;
  medChange: number;
}

/** Fit the model on a comp set (the full set for the board, a subset inside the backtest's folds). */
export function fitModel(comps: SnapshotProtocol[], model: ModelConstants = MODEL, robust = false): FittedModel {
  const medChange = medianCompChange(comps);
  const curve = robust
    ? huberOls(
        comps.map((p) => Math.log10(forwardTvl(p, medChange, model))),
        comps.map((p) => Math.log10(p.mcap_usd!)),
      )
    : fitCurve(comps, medChange, model);
  return { curve, premiums: familyPremiums(comps, curve, medChange, model), medChange };
}

/** The launch value one protocol gets from a fitted model, and the pieces that made it. */
export function launchValue(p: SnapshotProtocol, fit: FittedModel, model: ModelConstants = MODEL): { value: number; fwdTvl: number; curveValue: number; premium: number; premiumPeers: number } {
  const fwd = forwardTvl(p, fit.medChange, model);
  const curveValue = Math.pow(10, fit.curve.a + fit.curve.b * Math.log10(fwd));
  const prem = fit.premiums.get(familyOf(p));
  const premium = prem?.adj ?? 1;
  return { value: curveValue * premium, fwdTvl: fwd, curveValue, premium, premiumPeers: prem?.peers ?? 0 };
}

// ---------------------------------------------------------------- the backtest

/** One model variant priced blind: its median miss and its within-3x rate, two ways. */
export interface BacktestVariant {
  key: string;
  label: string;
  loo_miss: number;
  loo_within3: number;
  split_miss: number;
  split_within3: number;
  /** Spearman rank correlation between the leave-one-out predictions and the real caps. */
  loo_rho: number;
}

/** The model's evidence: the ablation ladder, the residual bands, and how the bands held. */
export interface Backtest {
  comps: number;
  variants: BacktestVariant[];
  /** The final model's leave-one-out residual band, as multiplicative factors on a row's value. */
  band25: [number, number];
  band10: [number, number];
  /** On the time split (fit on the oldest half), how many newer caps fell inside each band. */
  band_holds: { in25_75: number; in10_90: number; n: number };
  split_n: number;
}

type Predictor = (train: SnapshotProtocol[]) => (p: SnapshotProtocol) => number;

const missOf = (pred: number, actual: number): number => Math.max(pred / actual, actual / pred);

/** Average ranks (ties share a rank), in the input's own order. */
function ranksOf(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]![1]] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Spearman rank correlation between two equal-length series. */
function spearman(xs: number[], ys: number[]): number {
  const rx = ranksOf(xs);
  const ry = ranksOf(ys);
  const n = xs.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i]! - mx) * (ry[i]! - my);
    sxx += (rx[i]! - mx) ** 2;
    syy += (ry[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

function scorePredictor(comps: SnapshotProtocol[], make: Predictor): { loo_miss: number; loo_within3: number; split_miss: number; split_within3: number; loo_rho: number; looResid: number[] } {
  const looMisses: number[] = [];
  const looResid: number[] = [];
  const looPreds: number[] = [];
  comps.forEach((p, i) => {
    const predict = make(comps.filter((_, j) => j !== i));
    const pred = predict(p);
    looPreds.push(pred);
    looMisses.push(missOf(pred, p.mcap_usd!));
    looResid.push(Math.log10(p.mcap_usd! / pred));
  });
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const predictSplit = make(dated.slice(0, half));
  const splitMisses = dated.slice(half).map((p) => missOf(predictSplit(p), p.mcap_usd!));
  return {
    loo_miss: median(looMisses),
    loo_within3: looMisses.filter((m) => m <= 3).length / looMisses.length,
    split_miss: median(splitMisses),
    split_within3: splitMisses.filter((m) => m <= 3).length / splitMisses.length,
    loo_rho: spearman(looPreds, comps.map((p) => p.mcap_usd!)),
    looResid,
  };
}

/** Least squares with Huber weights: three IRLS passes, the scale from the residuals' MAD. */
function huberOls(xs: number[], ys: number[]): CurveFit {
  let fit = ols(xs, ys);
  for (let iter = 0; iter < 3; iter++) {
    const resid = xs.map((x, i) => ys[i]! - (fit.a + fit.b * x));
    const centre = median(resid);
    const scale = 1.4826 * median(resid.map((r) => Math.abs(r - centre)));
    if (!(scale > 1e-9)) return fit;
    const k = 1.345 * scale;
    const w = resid.map((r) => Math.min(1, k / Math.max(Math.abs(r - centre), 1e-12)));
    let sw = 0;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < xs.length; i++) { sw += w[i]!; mx += w[i]! * xs[i]!; my += w[i]! * ys[i]!; }
    mx /= sw;
    my /= sw;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += w[i]! * (xs[i]! - mx) * (ys[i]! - my);
      sxx += w[i]! * (xs[i]! - mx) ** 2;
    }
    const b = sxx > 0 ? sxy / sxx : 0;
    fit = { a: my - b * mx, b };
  }
  return fit;
}

/** The variants the ladder compares, weakest first; each is a way of pricing a comp from the rest. */
function variantMakers(model: ModelConstants, asOf: string): { key: string; label: string; make: Predictor }[] {
  const flat: Predictor = (train) => {
    const mult = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    return (p) => p.tvl_usd * mult;
  };
  const curveOnly = (growth: boolean): Predictor => (train) => {
    const med = medianCompChange(train);
    const curve = ols(
      train.map((p) => Math.log10(growth ? forwardTvl(p, med, model) : p.tvl_usd)),
      train.map((p) => Math.log10(p.mcap_usd!)),
    );
    return (p) => Math.pow(10, curve.a + curve.b * Math.log10(growth ? forwardTvl(p, med, model) : p.tvl_usd));
  };
  const full: Predictor = (train) => {
    const fit = fitModel(train, model);
    return (p) => launchValue(p, fit, model).value;
  };
  const modelFit: Predictor = (train) => {
    const fit = fitModel(train, model, true);
    return (p) => launchValue(p, fit, model).value;
  };
  const fullAge: Predictor = (train) => {
    const fit = fitModel(train, model, true);
    const dated = train.filter((p) => p.listed_at !== null);
    const stage = dated.length > 10
      ? ols(
          dated.map((p) => Math.log10(1 + (ageDays(asOf, p.listed_at) ?? 0))),
          dated.map((p) => Math.log10(p.mcap_usd! / launchValue(p, fit, model).value)),
        )
      : { a: 0, b: 0 };
    const medAge = dated.length > 0 ? median(dated.map((p) => ageDays(asOf, p.listed_at) ?? 0)) : 365;
    return (p) => {
      const base = launchValue(p, fit, model).value;
      const age = ageDays(asOf, p.listed_at) ?? medAge;
      return base * Math.pow(10, stage.a + stage.b * Math.log10(1 + age));
    };
  };
  const rawcat: Predictor = (train) => {
    const fit = fitModel(train, model, true);
    const ratios = new Map<string, number[]>();
    for (const p of train) {
      const cv = Math.pow(10, fit.curve.a + fit.curve.b * Math.log10(forwardTvl(p, fit.medChange, model)));
      const list = ratios.get(p.category ?? '') ?? [];
      list.push(p.mcap_usd! / cv);
      ratios.set(p.category ?? '', list);
    }
    const prem = new Map([...ratios].map(([c, list]) => [c, median(list)] as const));
    return (p) => {
      const cv = Math.pow(10, fit.curve.a + fit.curve.b * Math.log10(forwardTvl(p, fit.medChange, model)));
      return cv * (prem.get(p.category ?? '') ?? 1);
    };
  };
  return [
    { key: 'flat', label: 'one flat multiple of TVL', make: flat },
    { key: 'curve', label: '+ size curve (slope on log TVL)', make: curveOnly(false) },
    { key: 'growth', label: '+ growth carry on forward TVL', make: curveOnly(true) },
    { key: 'full', label: '+ family premium', make: full },
    { key: 'model', label: '+ Huber-robust curve (the model)', make: modelFit },
    { key: 'age', label: '+ age inside the price (tested, not kept)', make: fullAge },
    { key: 'rawcat', label: '+ raw category premiums (tested, not kept)', make: rawcat },
  ];
}

/** Run the ladder over the comps and measure the final model's bands, all from the snapshot. */
export function backtestModel(comps: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): Backtest {
  const makers = variantMakers(model, asOf);
  const scored = makers.map((v) => ({ ...v, score: scorePredictor(comps, v.make) }));
  const fullScore = scored.find((s) => s.key === 'model')!.score;
  const band25: [number, number] = [Math.pow(10, quantile(fullScore.looResid, 0.25)), Math.pow(10, quantile(fullScore.looResid, 0.75))];
  const band10: [number, number] = [Math.pow(10, quantile(fullScore.looResid, 0.1)), Math.pow(10, quantile(fullScore.looResid, 0.9))];
  // Band honesty on the time split: fit on the oldest half, ask where the newer caps fell.
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const fit = fitModel(dated.slice(0, half), model, true);
  let in25 = 0;
  let in10 = 0;
  for (const p of dated.slice(half)) {
    const pred = launchValue(p, fit, model).value;
    if (p.mcap_usd! >= pred * band25[0] && p.mcap_usd! <= pred * band25[1]) in25++;
    if (p.mcap_usd! >= pred * band10[0] && p.mcap_usd! <= pred * band10[1]) in10++;
  }
  const n = dated.length - half;
  return {
    comps: comps.length,
    variants: scored.map((s) => ({
      key: s.key,
      label: s.label,
      loo_miss: round2(s.score.loo_miss),
      loo_within3: round4(s.score.loo_within3),
      split_miss: round2(s.score.split_miss),
      split_within3: round4(s.score.split_within3),
      loo_rho: round4(s.score.loo_rho),
    })),
    band25: [round4(band25[0]), round4(band25[1])],
    band10: [round4(band10[0]), round4(band10[1])],
    band_holds: { in25_75: in25, in10_90: in10, n },
    split_n: n,
  };
}

// ---------------------------------------------------------------- refit stability

/** How the board's head survives refitting: bootstrap refits of the curve, and each cut's own top set. */
export interface Stability {
  refits: number;
  top_n: number;
  /** Of the model's top_n, how many sit inside the top_n in at least 80% of the refits. */
  holds: number;
  /** The median refit overlap with the model's top_n. */
  median_overlap: number;
  /** Per ladder variant: how many of the model's top_n that variant's own board keeps in its top_n. */
  kept: Record<string, number>;
}

/** A small deterministic PRNG (mulberry32): the refits must land identically on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Refit the model on bootstrap resamples of the comps (seeded, so the run is deterministic)
 * and re-rank the board each time: how much of the head is the fit, and how much is luck.
 * Also prices the board under each ladder variant fitted on all comps, and counts how many
 * of the model's top_n each variant's own ranking keeps - the ablation, stated in ranks.
 */
export function refitStability(comps: SnapshotProtocol[], ranked: SnapshotProtocol[], topSlugs: string[], asOf: string, model: ModelConstants = MODEL): Stability {
  const topSet = new Set(topSlugs);
  const topN = topSlugs.length;
  const topOf = (price: (p: SnapshotProtocol) => number): Set<string> => {
    const scored = ranked.map((p) => ({ slug: p.slug, v: price(p) }));
    scored.sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
    return new Set(scored.slice(0, topN).map((s) => s.slug));
  };
  const kept: Record<string, number> = {};
  for (const v of variantMakers(model, asOf)) {
    const predict = v.make(comps);
    const own = topOf(predict);
    kept[v.key] = [...topSet].filter((s) => own.has(s)).length;
  }
  const REFITS = 200;
  const rng = mulberry32(20261119);
  const tally = new Map<string, number>();
  const overlaps: number[] = [];
  for (let r = 0; r < REFITS; r++) {
    const sample = Array.from({ length: comps.length }, () => comps[Math.floor(rng() * comps.length)]!);
    const fit = fitModel(sample, model, true);
    const own = topOf((p) => launchValue(p, fit, model).value);
    let overlap = 0;
    for (const s of own) {
      tally.set(s, (tally.get(s) ?? 0) + 1);
      if (topSet.has(s)) overlap++;
    }
    overlaps.push(overlap);
  }
  const holds = topSlugs.filter((s) => (tally.get(s) ?? 0) >= 0.8 * REFITS).length;
  return { refits: REFITS, top_n: topN, holds, median_overlap: median(overlaps), kept };
}

// ---------------------------------------------------------------- launch odds

/** The odds model: how the share recording a token grows with tracked age, per category and overall. */
export interface OddsModel {
  /** The ever-rate: the token-record share of the oldest cohort, the curve's asymptote. */
  ever_global: number;
  buckets: { lo: number; hi: number; n: number; rate: number }[];
  rateAt: (age: number) => number;
  catEver: (category: string | null) => number;
}

const ODDS_BUCKETS: [number, number][] = [[0, 90], [90, 180], [180, 365], [365, 730], [730, 1460], [1460, Number.POSITIVE_INFINITY]];

/** Build the odds model from the snapshot's dated protocols (645 of 758 on the sealed snapshot). */
export function buildOddsModel(snapshot: Snapshot): OddsModel {
  const dated = snapshot.protocols
    .map((p) => ({ p, age: ageDays(snapshot.as_of, p.listed_at) }))
    .filter((x): x is { p: SnapshotProtocol; age: number } => x.age !== null);
  const globalRate = dated.length > 0 ? dated.filter((x) => recordsToken(x.p)).length / dated.length : 0;
  const buckets = ODDS_BUCKETS.map(([lo, hi]) => {
    const inBucket = dated.filter((x) => x.age >= lo && x.age < hi);
    return {
      lo,
      hi,
      n: inBucket.length,
      rate: inBucket.length > 0 ? inBucket.filter((x) => recordsToken(x.p)).length / inBucket.length : globalRate,
    };
  });
  const oldest = dated.filter((x) => x.age >= 1460);
  const ever = oldest.length >= 20 ? oldest.filter((x) => recordsToken(x.p)).length / oldest.length : globalRate;
  const rateAt = (age: number): number => {
    const bucket = buckets.find((b) => age >= b.lo && age < b.hi) ?? buckets[buckets.length - 1]!;
    return bucket.rate;
  };
  const shareDone = (age: number): number => (ever > 0 ? clamp(rateAt(age) / ever, 0, 1) : 0);
  const catEverCache = new Map<string | null, number>();
  const catEver = (category: string | null): number => {
    if (catEverCache.has(category)) return catEverCache.get(category)!;
    const members = dated.filter((x) => x.p.category === category);
    let result = ever;
    if (members.length >= 8) {
      const rawShare = members.filter((x) => recordsToken(x.p)).length / members.length;
      const meanDone = members.reduce((s, x) => s + shareDone(x.age), 0) / members.length;
      if (meanDone > 0.05) {
        const corrected = clamp(rawShare / meanDone, rawShare, 0.97);
        const w = members.length / (members.length + 10);
        result = corrected * w + ever * (1 - w);
      }
    }
    catEverCache.set(category, result);
    return result;
  };
  return { ever_global: round4(ever), buckets: buckets.map((b) => ({ ...b, rate: round4(b.rate) })), rateAt, catEver };
}

/** The chance a launch is still to come for one protocol, in survival form. */
export function launchOdds(p: SnapshotProtocol, om: OddsModel, asOf: string, model: ModelConstants = MODEL): number {
  const age = ageDays(asOf, p.listed_at) ?? 365;
  const done = om.ever_global > 0 ? clamp(om.rateAt(age) / om.ever_global, 0, 1) : 0;
  const everCat = om.catEver(p.category);
  const denom = 1 - everCat * done;
  const odds = denom > 0 ? (everCat * (1 - done)) / denom : everCat;
  return clamp(odds, model.odds_floor, model.odds_cap);
}

/** The odds model, held out: fitted on the older half of the dated protocols, calling the newer half. */
export interface OddsCheck {
  /** Newer-half protocols the check called (dated only). */
  n: number;
  /** Older-half protocols the check fitted on. */
  train_n: number;
  /** Share of the newer half whose recorded-token status the older-half model called at even odds. */
  called_right: number;
  /** What always guessing the newer half's majority status would score on the same protocols. */
  base_called: number;
  /** The newer half's own recorded-token share (the majority the base rate guesses from). */
  share_launched: number;
  /** Rank discrimination (AUC) of the implied already-launched share against recorded status. */
  auc: number;
}

/**
 * Fit the odds model on the older half of the dated protocols alone, then ask it, for each
 * newer protocol, whether that protocol has already recorded a token by its age: predicted
 * share = its category's ever-rate x the share of its launches this age has already used.
 * A call at even odds or better counts as "already launched". Deterministic: the split is
 * by listed date, ties broken by slug.
 */
export function oddsCheck(snapshot: Snapshot): OddsCheck {
  const dated = snapshot.protocols
    .map((p) => ({ p, age: ageDays(snapshot.as_of, p.listed_at) }))
    .filter((x): x is { p: SnapshotProtocol; age: number } => x.age !== null)
    .sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : a.p.listed_at! > b.p.listed_at! ? 1 : a.p.slug < b.p.slug ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half).map((x) => x.p);
  const test = dated.slice(half);
  const om = buildOddsModel({ ...snapshot, protocols: train });
  let called = 0;
  const preds = test.map((x) => {
    const everCat = om.catEver(x.p.category);
    const done = om.ever_global > 0 ? clamp(om.rateAt(x.age) / om.ever_global, 0, 1) : 0;
    const pAlready = everCat * done;
    if ((pAlready >= 0.5) === recordsToken(x.p)) called++;
    return { p: pAlready, y: recordsToken(x.p) ? 1 : 0 };
  });
  const pos = preds.filter((t) => t.y === 1);
  const neg = preds.filter((t) => t.y === 0);
  let wins = 0;
  let ties = 0;
  for (const a of pos) {
    for (const b of neg) {
      if (a.p > b.p) wins++;
      else if (a.p === b.p) ties++;
    }
  }
  const share = test.length > 0 ? pos.length / test.length : 0;
  return {
    n: test.length,
    train_n: train.length,
    called_right: test.length > 0 ? round4(called / test.length) : 0,
    base_called: round4(Math.max(share, 1 - share)),
    share_launched: round4(share),
    auc: pos.length > 0 && neg.length > 0 ? round4((wins + 0.5 * ties) / (pos.length * neg.length)) : 0,
  };
}

// ---------------------------------------------------------------- farm plans

/** A farm step: the action, what it costs (words and dollars), and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
  cost_usd: number;
  minutes: number;
}

/** Gas per simple transaction, in dollars, at the tiers farmPlan() states. */
const GAS_USD: Record<string, number> = {
  Ethereum: 4.5, 'BNB Chain': 0.35, Binance: 0.35, Solana: 0.05, Base: 0.15, Arbitrum: 0.25,
  Optimism: 0.2, Polygon: 0.05, Avalanche: 0.3, Tron: 1.2, Sui: 0.05, Aptos: 0.05, Near: 0.05,
  Bitcoin: 2.5, 'Hyperliquid L1': 0.05, Ink: 0.1, Pharos: 0.1, Stellar: 0.05, Mantle: 0.1,
  Linea: 0.15, Scroll: 0.2, 'zkSync Era': 0.2, Fantom: 0.05, Sonic: 0.05, Cosmos: 0.1,
  Osmosis: 0.1, Sei: 0.05, Berachain: 0.1, Monad: 0.05, Plasma: 0.05, Canton: 0.1, RISE: 0.05,
  Bittensor: 0.1, Provenance: 0.05, 'Bitcoin Cash': 0.05, Hedera: 0.05, Algorand: 0.05,
  Cardano: 0.2, Polkadot: 0.1, Kaspa: 0.05, Stacks: 0.5, Flow: 0.05, Tezos: 0.05,
};

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function gasOf(p: SnapshotProtocol): number {
  return GAS_USD[chainOf(p)] ?? 0.5;
}

/** The plan's deposit: TVL x the model's share, clamped, rounded to two significant figures. */
export function depositFor(p: SnapshotProtocol, model: ModelConstants = MODEL): number {
  const raw = clamp(p.tvl_usd * model.deposit_tvl_share, model.deposit_min, model.deposit_max);
  const step = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / step) * step;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, deposit: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const d = `$${deposit.toLocaleString('en-US')}`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply ${d} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide ${d} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge ${d} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake ${d} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return `Deposit ${d} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund ${d} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit ${d} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit ${d} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint ${d} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy ${d} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit ${d} of USDC into ${name} on ${chain} and keep the position open.`;
}

const money = (n: number): string => `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0 })}`;

/** A protocol's farm plan: the steps, and the economics they add up to. */
export interface FarmPlan {
  deposit_usd: number;
  hold_days: number;
  steps: FarmStep[];
  fees_usd: number;
  time_minutes: number;
  /** The expected drop for this deposit: drop share x launch value x odds, pro-rata to TVL. */
  slice_usd: number;
  opportunity_usd: number;
  net_usd: number;
  /** The launch odds at which the plan's costs are exactly covered. */
  break_even_odds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
}

/** Build one protocol's farm plan from its own record and its scored value and odds. */
export function farmPlan(p: SnapshotProtocol, launchValueUsd: number, odds: number, age: number | null, asOf: string, model: ModelConstants = MODEL): FarmPlan {
  const chain = chainOf(p);
  const gas = gasOf(p);
  const deposit = depositFor(p, model);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const reviewDate = new Date(Date.parse(`${asOf}T00:00:00Z`) + hold * DAY_MS).toISOString().slice(0, 10);
  const stopTvl = Math.round(p.tvl_usd * 0.7);
  const steps: FarmStep[] = [
    {
      text: `Move ${money(deposit)} to a fresh ${chain} wallet used for nothing else; keep the fee money in it.`,
      cost: money(1.5 + gas), time: '15 minutes', cost_usd: round2(1.5 + gas), minutes: 15,
    },
    {
      text: `Open ${p.name}'s own page from the index's link (never a search ad); check the contract, the audits, and that it still lists no token.`,
      cost: 'nothing', time: '15 minutes', cost_usd: 0, minutes: 15,
    },
    {
      text: actionFor(p, deposit, chain),
      cost: money(gas * 2), time: '15 minutes', cost_usd: round2(gas * 2), minutes: 15,
    },
    {
      text: `Weekly for ${weeks} weeks: one small qualifying action (a deposit, a swap, a borrow or a vote), so the wallet reads as a user, not a snapshot.`,
      cost: money(gas * weeks), time: `${10 * weeks} min over the hold`, cost_usd: round2(gas * weeks), minutes: 10 * weeks,
    },
    {
      text: `Review on ${reviewDate}: unwind instead of adding if TVL falls under ${money(stopTvl)} (70% of the snapshot's ${money(p.tvl_usd)}), if withdrawals pause, or if a token is announced.`,
      cost: 'nothing', time: '10 minutes', cost_usd: 0, minutes: 10,
    },
    {
      text: `If a token launches, claim only via the link on ${p.name}'s own page, then revoke unneeded approvals.`,
      cost: money(gas), time: '10 minutes', cost_usd: round2(gas), minutes: 10,
    },
    {
      text: `After ${hold} days, or at the claim, unwind and send the funds back to the exchange.`,
      cost: money(gas * 2 + 1.5), time: '15 minutes', cost_usd: round2(gas * 2 + 1.5), minutes: 15,
    },
  ];
  const fees = round2(steps.reduce((s, x) => s + x.cost_usd, 0));
  const minutes = steps.reduce((s, x) => s + x.minutes, 0);
  const sliceAtOdds1 = (model.drop_share * launchValueUsd * deposit) / p.tvl_usd;
  const slice = sliceAtOdds1 * odds;
  const opportunity = (deposit * model.risk_free_rate * hold) / 365;
  const net = slice - fees - opportunity;
  const breakEven = sliceAtOdds1 > 0 ? (fees + opportunity) / sliceAtOdds1 : 99;
  const verdict = net >= model.farm_net ? 'FARM' : net >= model.marginal_net ? 'MARGINAL' : 'SKIP';
  return {
    deposit_usd: deposit,
    hold_days: hold,
    steps,
    fees_usd: fees,
    time_minutes: minutes,
    slice_usd: round2(slice),
    opportunity_usd: round2(opportunity),
    net_usd: round2(net),
    break_even_odds: round4(breakEven),
    verdict,
  };
}

/** A step as one string for board.json: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

// ---------------------------------------------------------------- the board

/** A row's full breakdown: every input the implied value and the verdict were built from. */
export interface FactorBreakdown {
  fwd_tvl_usd: number;
  curve_value_usd: number;
  family: string;
  family_premium: number;
  family_peers: number;
  launch_value_usd: number;
  launch_odds: number;
  /** The row's category ever-rate and the share of its launches the odds model counts as done by this age. */
  odds_ever: number;
  odds_done: number;
  band_low_usd: number;
  band_high_usd: number;
  rank_low: number;
  rank_high: number;
  deposit_usd: number;
  drop_slice_usd: number;
  fees_usd: number;
  opportunity_usd: number;
  net_usd: number;
  break_even_odds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
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

/** The dashboard's view of one row: the board's fields plus everything its detail view renders. */
export interface RadarRow extends FactorBreakdown {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  hold_days: number;
  time_minutes: number;
  steps: FarmStep[];
  nearest: { name: string; symbol: string | null; tvl_usd: number; mcap_usd: number }[];
}

/** A traded comparable, as the dashboard's scatter and anchors view carry it. */
export interface CompRow {
  slug: string;
  name: string;
  symbol: string | null;
  tvl_usd: number;
  fwd_tvl_usd: number;
  mcap_usd: number;
  family: string;
}

/** A protocol that already trades, with the market's own cap (the dashboard's traded view). */
export interface TradeRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the fit, the tests, and the traded set. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  universe: { total: number; buckets: UniverseBucket[] };
  fit: { a: number; b: number; comps: number; med_change: number };
  families: FamilyPremium[];
  backtest: Backtest;
  odds: { ever_global: number; buckets: { lo: number; hi: number; n: number; rate: number }[] };
  odds_check: OddsCheck;
  stability: Stability;
  totals: {
    implied_total: number;
    farm: number;
    marginal: number;
    skip: number;
    best_net_per_hour: { slug: string; name: string; per_hour: number } | null;
  };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  comps: CompRow[];
  trades: TradeRow[];
}

/** Score every ranked protocol, order the board, and attach bands, rank ranges and farm plans. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; universe: Universe; fit: FittedModel; backtest: Backtest; oddsModel: OddsModel; stability: Stability } {
  const universe = selectUniverse(snapshot);
  const fit = fitModel(universe.comps, model, true);
  const backtest = backtestModel(universe.comps, snapshot.as_of, model);
  const oddsModel = buildOddsModel(snapshot);
  const watchlist = new Set(snapshot.watchlist);

  const scored = universe.ranked.map((p) => {
    const lv = launchValue(p, fit, model);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const odds = launchOdds(p, oddsModel, snapshot.as_of, model);
    const plan = farmPlan(p, lv.value, odds, age, snapshot.as_of, model);
    return { p, lv, age, odds, plan };
  });
  scored.sort((a, b) => b.lv.value - a.lv.value || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const values = scored.map((s) => s.lv.value);
  let prev = Number.POSITIVE_INFINITY;
  const board: BoardRow[] = scored.map((s, i) => {
    let implied = Math.max(1, Math.round(s.lv.value));
    if (implied >= prev) implied = Math.max(1, prev - 1);
    prev = implied;
    const bandLow = s.lv.value * backtest.band25[0];
    const bandHigh = s.lv.value * backtest.band25[1];
    const breakdown: FactorBreakdown = {
      fwd_tvl_usd: Math.round(s.lv.fwdTvl),
      curve_value_usd: Math.round(s.lv.curveValue),
      family: familyOf(s.p),
      family_premium: round4(s.lv.premium),
      family_peers: s.lv.premiumPeers,
      launch_value_usd: Math.round(s.lv.value),
      launch_odds: round4(s.odds),
      odds_ever: round4(oddsModel.catEver(s.p.category)),
      odds_done: round4(oddsModel.ever_global > 0 ? clamp(oddsModel.rateAt(s.age ?? 365) / oddsModel.ever_global, 0, 1) : 0),
      band_low_usd: Math.round(bandLow),
      band_high_usd: Math.round(bandHigh),
      rank_low: 1 + values.filter((v) => v > bandHigh).length,
      rank_high: Math.max(i + 1, values.filter((v) => v >= bandLow).length),
      deposit_usd: s.plan.deposit_usd,
      drop_slice_usd: s.plan.slice_usd,
      fees_usd: s.plan.fees_usd,
      opportunity_usd: s.plan.opportunity_usd,
      net_usd: s.plan.net_usd,
      break_even_odds: s.plan.break_even_odds,
      verdict: s.plan.verdict,
    };
    return {
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
      implied_value_usd: implied,
      model: breakdown,
      farm_steps: s.plan.steps.map(stepText),
    };
  });
  void watchlist;
  const stability = refitStability(universe.comps, universe.ranked, board.slice(0, 20).map((r) => r.slug), snapshot.as_of, model);
  return { board, universe, fit, backtest, oddsModel, stability };
}

/** The three traded comparables nearest a protocol by TVL inside its own family. */
function nearestComps(p: SnapshotProtocol, comps: SnapshotProtocol[]): { name: string; symbol: string | null; tvl_usd: number; mcap_usd: number }[] {
  const fam = familyOf(p);
  const logT = Math.log10(p.tvl_usd);
  return comps
    .filter((c) => familyOf(c) === fam)
    .sort((a, b) => Math.abs(Math.log10(a.tvl_usd) - logT) - Math.abs(Math.log10(b.tvl_usd) - logT) || (a.slug < b.slug ? -1 : 1))
    .slice(0, 3)
    .map((c) => ({ name: c.name, symbol: c.symbol, tvl_usd: c.tvl_usd, mcap_usd: c.mcap_usd! }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, universe, fit, backtest, oddsModel, stability } = buildBoard(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const rows: RadarRow[] = board.map((row) => {
    const p = bySlug.get(row.slug)!;
    const plan = farmPlan(p, row.model.launch_value_usd, row.model.launch_odds, row.age_days, snapshot.as_of, model);
    return {
      ...row.model,
      rank: row.rank,
      slug: row.slug,
      name: row.name,
      category: row.category,
      chains: row.chains,
      tvl_usd: row.tvl_usd,
      change_7d: row.change_7d,
      listed_at: row.listed_at,
      gecko_id: row.gecko_id,
      symbol: row.symbol,
      age_days: row.age_days,
      implied_value_usd: row.implied_value_usd,
      watchlist: watchlist.has(row.slug),
      band_low_usd: row.model.band_low_usd,
      band_high_usd: row.model.band_high_usd,
      hold_days: plan.hold_days,
      time_minutes: plan.time_minutes,
      steps: plan.steps,
      nearest: nearestComps(p, universe.comps),
    };
  });
  const best = rows
    .filter((r) => r.time_minutes > 0)
    .map((r) => ({ slug: r.slug, name: r.name, per_hour: r.net_usd / (r.time_minutes / 60) }))
    .sort((a, b) => b.per_hour - a.per_hour)[0];
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    universe: { total: universe.total, buckets: universe.buckets },
    fit: { a: round4(fit.curve.a), b: round4(fit.curve.b), comps: universe.comps.length, med_change: round2(fit.medChange) },
    families: [...fit.premiums.values()].sort((a, b) => b.peers - a.peers).map((f) => ({ family: f.family, peers: f.peers, raw: round4(f.raw), adj: round4(f.adj) })),
    backtest,
    odds: { ever_global: oddsModel.ever_global, buckets: oddsModel.buckets },
    odds_check: oddsCheck(snapshot),
    stability,
    totals: {
      implied_total: board.reduce((s, r) => s + r.implied_value_usd, 0),
      farm: board.filter((r) => r.model.verdict === 'FARM').length,
      marginal: board.filter((r) => r.model.verdict === 'MARGINAL').length,
      skip: board.filter((r) => r.model.verdict === 'SKIP').length,
      best_net_per_hour: best !== undefined ? { slug: best.slug, name: best.name, per_hour: round2(best.per_hour) } : null,
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watchlist.has(r.slug)).length,
    live_size: universe.trades.length,
    rows,
    comps: universe.comps.map((c) => ({ slug: c.slug, name: c.name, symbol: c.symbol, tvl_usd: c.tvl_usd, fwd_tvl_usd: Math.round(forwardTvl(c, fit.medChange, model)), mcap_usd: c.mcap_usd!, family: familyOf(c) })),
    trades: universe.trades
      .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : 1))
      .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, change_7d: p.change_7d })),
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
