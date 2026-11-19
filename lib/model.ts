// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// Model "fitted-comps-3" keeps fitted-comps-2's Huber-robust size curve and replaces its
// bucket launch odds with a fitted logistic model, then prices those odds into the board:
// the headline implied value is the value if it launches, weighted by the chance a launch
// is still to come. The value side is unchanged from fitted-comps-2, whose own backtest
// beats the flat baselines of peer-multiple-1/2: priced blind, one flat multiple of TVL
// misses a traded token's real cap by x4.65 (median, leave-one-out over the comparables),
// while the fitted curve below misses by x3.22. The model is:
//
//   selectUniverse  every protocol in the snapshot is accounted for exactly once. The board
//                   ranks the stand-alone protocols that record no token (197 on the sealed
//                   snapshot); the comparables ("comps") are the stand-alone protocols whose
//                   token trades with a live market cap (92). Bridges, staking forms,
//                   exchange custody, versioned releases and wrapped-or-staked names are set
//                   aside with their counts printed, never silently dropped. A protocol
//                   whose record shows a market cap of zero or less records a token but has
//                   no live cap: it sits with "token on record, no cap", never with comps.
//   fitCurve        log10(market cap) = a + b x log10(forward TVL), fitted over the comps
//                   with Huber-robust weights (three IRLS passes, the scale from the
//                   residuals' MAD). Ten times the TVL buys about 2.65 times the value
//                   (b ~ 0.42), not ten times. The robust fit was adopted on blind-test
//                   evidence, not taste: it beats the plain least-squares line on
//                   leave-one-out (x3.22 against x3.29), on the older-to-newer split
//                   (x2.24 against x2.27) and on held-out rank correlation (0.4136, the
//                   best of the seven variants in the backtest ladder).
//   growth carry    forward TVL = TVL x (1 + excess 7d)^gamma, gamma 0.42, the excess being
//                   the protocol's 7-day change less the comps' median change, clamped to
//                   +/-60 points. One week of flow is the snapshot's noisiest figure, so it
//                   moves the value being priced, bounded, never the price directly.
//   familyPremium   each family's traded tokens sit a median ratio above or below the
//                   curve; that ratio, shrunk toward 1 by n/(n+8), multiplies the curve's
//                   value. Families group DefiLlama's categories so a premium rests on
//                   4-27 launches, never on one.
//   launchOdds      the chance a launch is still to come, fitted - not bucketed - on the
//                   snapshot's dated protocols (645 of 758): a logistic curve over
//                   log-age and the protocol's category launch rate (shrunk toward the
//                   global rate by n/(n+10)) estimates q, the chance a protocol with these
//                   features has already recorded a token by its age. The still-to-come
//                   chance is the survival form (E - q) / (1 - q), where E is the
//                   category's ever-rate: its own recorded share corrected for its age
//                   mix against the fitted curve, blended toward the oldest cohort's
//                   rate (0.80). Held out - fitted on the older half of the dated
//                   protocols, calling the newer half - the fitted form calls 67% of
//                   statuses right against the 64.4% majority base (AUC 0.60); the
//                   bucket form it replaces called 48.6% on the same split. A second,
//                   coin-flip split is printed beside it in the odds check, because the
//                   two framings have different base rates and only one of them is the
//                   hard one. The edge is modest and the page says so; it is real on
//                   both framings, which is the bar the odds had to clear before they
//                   were allowed into the price. Age inside the value itself was tested
//                   and rejected by the blind test: age prices the odds, not the value.
//   implied value   the headline number is odds-weighted: value if it launches (curve x
//                   premium, on forward TVL) times the launch odds above. The unweighted
//                   launch value stays printed on every row's detail page, and the bands
//                   and rank ranges below ride on the weighted value the board ranks by.
//   bands           each row's P25-P75 range is the leave-one-out residual band of the
//                   fitted model itself (x0.27 to x3.04), and its rank range is where the
//                   row lands when its weighted value moves across that band. The bands'
//                   honesty is measured, not asserted: fitted on the oldest half of the
//                   comps, they caught the real caps of the newer half at the rates
//                   printed in the backtest block.
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

import { createHash } from 'node:crypto';

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
export const MODEL_VERSION = 'fitted-comps-3';

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
export function refitStability(comps: SnapshotProtocol[], ranked: SnapshotProtocol[], topSlugs: string[], asOf: string, model: ModelConstants = MODEL, weightOf?: (p: SnapshotProtocol) => number): Stability {
  const topSet = new Set(topSlugs);
  const topN = topSlugs.length;
  const topOf = (price: (p: SnapshotProtocol) => number): Set<string> => {
    const scored = ranked.map((p) => ({ slug: p.slug, v: price(p) * (weightOf !== undefined ? weightOf(p) : 1) }));
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

/** Age bands for the descriptive bucket table: how the token-record share grows with tracked age. */
const ODDS_BUCKETS: [number, number][] = [[0, 90], [90, 180], [180, 365], [365, 730], [730, 1460], [1460, Number.POSITIVE_INFINITY]];

/** A protocol with its tracked age in days: the odds universe is the dated protocols only. */
interface DatedRow {
  p: SnapshotProtocol;
  age: number;
}

function datedRows(snapshot: Snapshot): DatedRow[] {
  return snapshot.protocols
    .map((p) => ({ p, age: ageDays(snapshot.as_of, p.listed_at) }))
    .filter((x): x is DatedRow => x.age !== null);
}

/**
 * Category launch rates on one fit set: each category's recorded-token share, shrunk toward
 * the set's global rate by n/(n+10); a category the set never saw gets the global rate.
 * Fitted on the fit set alone, so a held-out call never sees its own answer.
 */
function categoryRates(dated: DatedRow[]): { global: number; rate: (category: string | null) => number } {
  const global = dated.length > 0 ? dated.filter((x) => recordsToken(x.p)).length / dated.length : 0;
  const byCat = new Map<string | null, { n: number; launched: number }>();
  for (const x of dated) {
    const cell = byCat.get(x.p.category) ?? { n: 0, launched: 0 };
    cell.n++;
    if (recordsToken(x.p)) cell.launched++;
    byCat.set(x.p.category, cell);
  }
  return {
    global,
    rate: (category: string | null): number => {
      const cell = byCat.get(category);
      return cell === undefined ? global : (cell.launched + 10 * global) / (cell.n + 10);
    },
  };
}

const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/** The fitted odds form: q = sigmoid(b0 + b1 x z(log10(age+1)) + b2 x z(category rate)), z scored on the fit set. */
export interface OddsFit {
  b0: number;
  b1: number;
  b2: number;
  mu_age: number;
  sd_age: number;
  mu_crate: number;
  sd_crate: number;
  /** The fit set's own recorded-token share. */
  global_rate: number;
}

/** Solve a 3x3 linear system by Gaussian elimination with partial pivoting. */
function solve3(a: number[][], b: number[]): number[] {
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    const swap = m[col]!;
    m[col] = m[piv]!;
    m[piv] = swap;
    const d = m[col]![col]!;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / d;
      for (let c = col; c < 4; c++) m[r]![c] = m[r]![c]! - f * m[col]![c]!;
    }
  }
  return [m[0]![3]! / m[0]![0]!, m[1]![3]! / m[1]![1]!, m[2]![3]! / m[2]![2]!];
}

/**
 * Fit the logistic odds form on one set of dated protocols: IRLS (Newton) passes with an
 * L2 penalty of 1 on the two standardised slopes, the intercept free, at most 100 passes.
 * Deterministic: fixed start, fixed pass count cap, no clock, no randomness.
 */
function fitLogistic(dated: DatedRow[], rates: { global: number; rate: (category: string | null) => number }): OddsFit {
  const xs = dated.map((x) => Math.log10(x.age + 1));
  const cs = dated.map((x) => rates.rate(x.p.category));
  const mean = (v: number[]): number => v.reduce((s, n) => s + n, 0) / Math.max(1, v.length);
  const sd = (v: number[], m: number): number => Math.sqrt(v.reduce((s, n) => s + (n - m) * (n - m), 0) / Math.max(1, v.length)) || 1;
  const muAge = mean(xs);
  const sdAge = sd(xs, muAge);
  const muCrate = mean(cs);
  const sdCrate = sd(cs, muCrate);
  const rows = dated.map((x, i) => ({
    z1: (xs[i]! - muAge) / sdAge,
    z2: (cs[i]! - muCrate) / sdCrate,
    y: recordsToken(x.p) ? 1 : 0,
  }));
  const g0 = clamp(rates.global, 0.01, 0.99);
  let beta = [Math.log(g0 / (1 - g0)), 0, 0];
  for (let iter = 0; iter < 100; iter++) {
    const grad = [0, 0, 0];
    const hess = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (const r of rows) {
      const eta = beta[0]! + beta[1]! * r.z1 + beta[2]! * r.z2;
      const p = sigmoid(eta);
      const w = Math.max(p * (1 - p), 1e-9);
      const xv = [1, r.z1, r.z2];
      for (let i = 0; i < 3; i++) {
        grad[i] = grad[i]! + xv[i]! * (r.y - p);
        for (let j = 0; j < 3; j++) hess[i]![j] = hess[i]![j]! + xv[i]! * xv[j]! * w;
      }
    }
    grad[1] = grad[1]! - beta[1]!;
    grad[2] = grad[2]! - beta[2]!;
    hess[1]![1] = hess[1]![1]! + 1;
    hess[2]![2] = hess[2]![2]! + 1;
    const step = solve3(hess, grad);
    let delta = 0;
    beta = beta.map((b, i) => {
      delta = Math.max(delta, Math.abs(step[i]!));
      return b + step[i]!;
    });
    if (delta < 1e-10) break;
  }
  return { b0: beta[0]!, b1: beta[1]!, b2: beta[2]!, mu_age: muAge, sd_age: sdAge, mu_crate: muCrate, sd_crate: sdCrate, global_rate: rates.global };
}

/** A fitted odds form plus the rate table it was fitted with: everything a q call needs. */
interface FittedOdds {
  fit: OddsFit;
  /** q at an explicit category-rate value (the ever-rate machinery reads the curve at the global rate). */
  qWith: (age: number, crate: number) => number;
  /** q for a protocol of this age and category. */
  qAt: (age: number, category: string | null) => number;
  rates: { global: number; rate: (category: string | null) => number };
}

function fitOddsOn(dated: DatedRow[]): FittedOdds {
  const rates = categoryRates(dated);
  const fit = fitLogistic(dated, rates);
  const qWith = (age: number, crate: number): number =>
    sigmoid(fit.b0 + fit.b1 * ((Math.log10(age + 1) - fit.mu_age) / fit.sd_age) + fit.b2 * ((crate - fit.mu_crate) / fit.sd_crate));
  return { fit, qWith, qAt: (age, category) => qWith(age, rates.rate(category)), rates };
}

/** The odds model: a fitted launch curve over the dated protocols, plus ever-rates in survival form. */
export interface OddsModel {
  /** The ever-rate: the token-record share of the oldest cohort, the survival form's asymptote. */
  ever_global: number;
  buckets: { lo: number; hi: number; n: number; rate: number }[];
  fit: OddsFit;
  qAt: (age: number, category: string | null) => number;
  catEver: (category: string | null) => number;
}

/** Build the odds model from the snapshot's dated protocols (645 of 758 on the sealed snapshot). */
export function buildOddsModel(snapshot: Snapshot): OddsModel {
  const dated = datedRows(snapshot);
  const fitted = fitOddsOn(dated);
  const globalRate = fitted.rates.global;
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
  /** The share of a category's eventual launches the fitted curve has used by this age, read at the global rate. */
  const shareDone = (age: number): number => (ever > 0 ? clamp(fitted.qWith(age, globalRate) / ever, 0, 1) : 0);
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
  return { ever_global: round4(ever), buckets: buckets.map((b) => ({ ...b, rate: round4(b.rate) })), fit: fitted.fit, qAt: fitted.qAt, catEver };
}

/** One protocol's odds and their parts: the still-to-come chance, the fitted already-launched share, the ever-rate, the share used. */
export function oddsParts(p: SnapshotProtocol, om: OddsModel, asOf: string, model: ModelConstants = MODEL): { odds: number; q: number; ever: number; done: number } {
  const age = ageDays(asOf, p.listed_at) ?? 365;
  const ever = om.catEver(p.category);
  const q = Math.min(om.qAt(age, p.category), 0.98);
  const odds = clamp((ever - q) / (1 - q), model.odds_floor, model.odds_cap);
  return { odds, q, ever, done: ever > 0 ? clamp(q / ever, 0, 1) : 0 };
}

/** The chance a launch is still to come for one protocol, in survival form over the fitted curve. */
export function launchOdds(p: SnapshotProtocol, om: OddsModel, asOf: string, model: ModelConstants = MODEL): number {
  return oddsParts(p, om, asOf, model).odds;
}

/** One held-out framing of the odds model: fitted on one set of dated protocols, calling another. */
export interface OddsSplitCheck {
  /** Test protocols the check called (dated only). */
  n: number;
  /** Protocols the check fitted on. */
  train_n: number;
  /** Share of the test set whose recorded-token status the fitted model called at even odds. */
  called_right: number;
  /** What always guessing the test set's majority status would score on the same protocols. */
  base_called: number;
  /** The test set's own recorded-token share (the majority the base rate guesses from). */
  share_launched: number;
  /** Rank discrimination (AUC) of the fitted already-launched share against recorded status. */
  auc: number;
  /** Mean squared probability error (Brier) of the fitted shares on the test set. */
  brier: number;
}

/** The odds model, held out under two framings, plus the bucket form it replaced as a control. */
export interface OddsCheck {
  /** The hard framing: fitted on the older half of the dated protocols, calling the newer half. */
  date: OddsSplitCheck;
  /** The balanced framing: a deterministic slug-hash coin flip, train and test spanning the same ages. */
  hash: OddsSplitCheck;
  /** The fitted-comps-2 bucket form on the date framing: what the old construction calls there. */
  bucket_date_called_right: number;
  /** The bucket form's AUC on the date framing. */
  bucket_date_auc: number;
}

/** Score a fitted odds form against a test set: calls at even odds, AUC, and Brier, against the majority base. */
function scoreOddsSplit(fitted: FittedOdds, test: DatedRow[]): Omit<OddsSplitCheck, 'n' | 'train_n'> {
  let called = 0;
  let brierSum = 0;
  const preds = test.map((x) => {
    const q = fitted.qAt(x.age, x.p.category);
    const y = recordsToken(x.p) ? 1 : 0;
    if ((q >= 0.5) === (y === 1)) called++;
    brierSum += (q - y) * (q - y);
    return { p: q, y };
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
    called_right: test.length > 0 ? round4(called / test.length) : 0,
    base_called: round4(Math.max(share, 1 - share)),
    share_launched: round4(share),
    auc: pos.length > 0 && neg.length > 0 ? round4((wins + 0.5 * ties) / (pos.length * neg.length)) : 0,
    brier: test.length > 0 ? round4(brierSum / test.length) : 0,
  };
}

/**
 * The fitted-comps-2 bucket construction, kept as the odds check's control: age-band rates
 * toward an ever-rate, a category's ever-rate corrected for its age mix. Fitted on one set
 * of dated protocols, it predicts already-launched as ever-rate x share of launches used.
 */
function bucketOddsOn(dated: DatedRow[]): { ever: number; rateAt: (age: number) => number; catEver: (category: string | null) => number } {
  const globalRate = dated.length > 0 ? dated.filter((x) => recordsToken(x.p)).length / dated.length : 0;
  const buckets = ODDS_BUCKETS.map(([lo, hi]) => {
    const inBucket = dated.filter((x) => x.age >= lo && x.age < hi);
    return {
      lo,
      hi,
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
  const catEver = (category: string | null): number => {
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
    return result;
  };
  return { ever, rateAt, catEver };
}

/**
 * Hold the odds model out, twice. Date framing: fit on the older half of the dated
 * protocols (by listed date, ties by slug), call the newer half - the hard test, because
 * the halves' age ranges barely overlap and the newer half has had less time to launch.
 * Hash framing: a coin flip on the slug's md5 parity splits the same protocols into
 * same-aged halves - the balanced test. Both are printed on the page; the headline is the
 * date framing. The bucket control runs on the date framing only.
 */
export function oddsCheck(snapshot: Snapshot): OddsCheck {
  const dated = datedRows(snapshot);
  const byDate = [...dated].sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : a.p.listed_at! > b.p.listed_at! ? 1 : a.p.slug < b.p.slug ? -1 : 1));
  const half = Math.floor(byDate.length / 2);
  const dateTrain = byDate.slice(0, half);
  const dateTest = byDate.slice(half);
  const dateScore = scoreOddsSplit(fitOddsOn(dateTrain), dateTest);
  const hashBit = (slug: string): number => parseInt(createHash('md5').update(slug, 'utf8').digest('hex').slice(-1), 16) % 2;
  const hashTrain = dated.filter((x) => hashBit(x.p.slug) === 0);
  const hashTest = dated.filter((x) => hashBit(x.p.slug) === 1);
  const hashScore = scoreOddsSplit(fitOddsOn(hashTrain), hashTest);
  const bm = bucketOddsOn(dateTrain);
  let bucketCalled = 0;
  const bucketPreds = dateTest.map((x) => {
    const done = bm.ever > 0 ? clamp(bm.rateAt(x.age) / bm.ever, 0, 1) : 0;
    const pAlready = bm.catEver(x.p.category) * done;
    if ((pAlready >= 0.5) === recordsToken(x.p)) bucketCalled++;
    return { p: pAlready, y: recordsToken(x.p) ? 1 : 0 };
  });
  const bPos = bucketPreds.filter((t) => t.y === 1);
  const bNeg = bucketPreds.filter((t) => t.y === 0);
  let bWins = 0;
  let bTies = 0;
  for (const a of bPos) {
    for (const b of bNeg) {
      if (a.p > b.p) bWins++;
      else if (a.p === b.p) bTies++;
    }
  }
  return {
    date: { n: dateTest.length, train_n: dateTrain.length, ...dateScore },
    hash: { n: hashTest.length, train_n: hashTrain.length, ...hashScore },
    bucket_date_called_right: dateTest.length > 0 ? round4(bucketCalled / dateTest.length) : 0,
    bucket_date_auc: bPos.length > 0 && bNeg.length > 0 ? round4((bWins + 0.5 * bTies) / (bPos.length * bNeg.length)) : 0,
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
  odds: { ever_global: number; buckets: { lo: number; hi: number; n: number; rate: number }[]; b_age: number; b_crate: number; global_rate: number };
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
    const parts = oddsParts(p, oddsModel, snapshot.as_of, model);
    const plan = farmPlan(p, lv.value, parts.odds, age, snapshot.as_of, model);
    return { p, lv, age, odds: parts.odds, parts, weighted: lv.value * parts.odds, plan };
  });
  scored.sort((a, b) => b.weighted - a.weighted || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const values = scored.map((s) => s.weighted);
  let prev = Number.POSITIVE_INFINITY;
  const board: BoardRow[] = scored.map((s, i) => {
    let implied = Math.max(1, Math.round(s.weighted));
    if (implied >= prev) implied = Math.max(1, prev - 1);
    prev = implied;
    const bandLow = s.weighted * backtest.band25[0];
    const bandHigh = s.weighted * backtest.band25[1];
    const breakdown: FactorBreakdown = {
      fwd_tvl_usd: Math.round(s.lv.fwdTvl),
      curve_value_usd: Math.round(s.lv.curveValue),
      family: familyOf(s.p),
      family_premium: round4(s.lv.premium),
      family_peers: s.lv.premiumPeers,
      launch_value_usd: Math.round(s.lv.value),
      launch_odds: round4(s.odds),
      odds_ever: round4(s.parts.ever),
      odds_done: round4(s.parts.done),
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
  const oddsBySlug = new Map(scored.map((s) => [s.p.slug, s.odds]));
  const stability = refitStability(universe.comps, universe.ranked, board.slice(0, 20).map((r) => r.slug), snapshot.as_of, model, (p) => oddsBySlug.get(p.slug) ?? 1);
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
    odds: { ever_global: oddsModel.ever_global, buckets: oddsModel.buckets, b_age: round4(oddsModel.fit.b1), b_crate: round4(oddsModel.fit.b2), global_rate: round4(oddsModel.fit.global_rate) },
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
