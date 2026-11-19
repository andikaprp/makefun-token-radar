# Value model - peer-multiple-1 (lane D prototype)

Status: working prototype in `lane-build/`. `lib/model.ts` is rewritten;
`main.ts` and `vendor/makefun-board.ts` are byte-identical to the kit
starter (sha256 verified), `dashboard/` and `screenshots/` are still the
starter's placeholders for the dashboard lane to replace. Nothing was
submitted; no account or repo was created.

## The snapshot gap (read first)

The sealed grading snapshot (758 protocols, 40 watchlist, `as_of`
2026-11-14) is **not present anywhere on this VM** - searched
`~/workspace/makefun`, all of `/home/hatch` and `/tmp`; the kit's extracted
copy is gone. All runs below are against a **sample rebuilt from live
DefiLlama** (`https://api.llama.fi/protocols`, fetched 2026-11-19) using
the exact construction rules in `reference/snapshot-README-from-kit.md`
(TVL >= $5M, ten fields, watchlist rule incl. parentProtocol / category /
name exclusions). The sample has **736 protocols and a 35-slug watchlist**,
and its top watchlist names (Steakhouse, Veda, Gauntlet, USDD, Upshift)
match the sealed snapshot's, so the mechanics are tested on realistic
data - but every number below will shift on the sealed snapshot, and
watchlist coverage must be re-verified at 40/40 there before submitting.

## Formula

For every pre-token protocol (no mcap, no gecko_id, no symbol):

```
peer ratio    = mcap_usd / tvl_usd of each tokenised protocol, clamped to [0.02, 10]
category mult = median peer ratio in the protocol's category, shrunk toward
                the global median:  mult = w*catMedian + (1-w)*globalMedian,
                w = peers / (peers + 4)
                - peers >= 4  -> source "category"
                - 1..3 peers  -> source "category-shrunk"
                - 0 peers     -> global median outright, source "global"
base          = tvl_usd * category mult
growthMult    = 1 + (clamp(change_7d, -60, +120) / 100) * 0.5
ageMult       = 0.6 + min(age_days, 1095)/1095 * 0.4   (unknown age = 365)
chainMult     = 1 + 0.02 * min(chains - 1, 5)          (max 1.10)
cap           = 2 * largest tokenised peer mcap in the category, but only
                when that category has >= 4 peers; otherwise 2 * largest
                peer mcap in the whole snapshot
implied       = max(1, min(cap, round(base * growthMult * ageMult * chainMult)))
```

Constants live in `MODEL` in `lib/model.ts` (`ratio_floor/cap 0.02/10`,
`min_peers 4`, `shrink_k 4`, `growth_weight 0.5`, `age_floor/range
0.6/0.4`, `age_days_cap 1095`, `chain_step 0.02`, `cap_factor 2`,
`fallback_multiple 0.25` if a snapshot ever had zero peers). Peer set
excludes CEX-category protocols. No protocol name is special-cased
anywhere; the watchlist is read from the snapshot, and the board is
watchlist + top-160 rankable pre-token protocols below the floor by TVL
(starter's `EARLY_ROWS`), sorted by implied value, ties by slug.

Design notes / decisions taken in this lane:

- **Median, not mean** - peer ratios are heavy-tailed; the median is the
  market's typical pricing of a comparable launch and resists one absurd
  print. Ratios are still clamped to [0.02, 10] before the median.
- **Saturating age** - the age factor stops growing at 3 years
  (1095 days), so age can separate a 3-month protocol from a 3-year one
  but can never dominate TVL.
- **Cap fix (found in testing)** - the first run let a 1-peer category
  set the cap from that peer's mcap: in Risk Curators that flattened
  Steakhouse ($2.68B TVL) and Gauntlet to the same ~$58M as $150M
  protocols and pushed Gauntlet to #7. The cap is a sanity guard, not a
  ranking tool, so thin categories now fall back to the global cap base.
  After the fix: 0 capped rows on the sample, top of the board matches
  watchlist TVL order of magnitude.

## Per-row factor breakdown

Every `board.json` row carries `model: FactorBreakdown`:

`peer_multiple` (also as `base_multiple` for starter-era readers),
`peer_source`, `peer_count`, `category_median_multiple` (null on global
fallback), `global_median_multiple`, `base_value_usd`, `growth_pct`,
`growth_multiplier`, `age_days`, `age_multiplier` (alias
`maturity_multiplier`), `chain_count`, `chain_multiplier`, `cap_usd`,
`capped`. Anyone can recompute a row's implied value from the snapshot
plus these fields. `data.js` rows carry the compact subset
(`peer_multiple`, `peer_source`, `growth_multiplier`, `age_multiplier`,
`chain_multiplier`) plus dataset-level `peer_global_median` and
`peer_protocols` in `window.RADAR`, so the detail view can show the same
breakdown without re-reading board.json. Live-token protocols stay out
of the board entirely: they are the peer set, and the dashboard's live
view (24 by mcap) shows their real market caps.

## Local run results (sample snapshot, Node v24.22.1)

Two consecutive runs produced **byte-identical outputs** (diff -r clean),
including dossier.json (705,011 bytes with the starter dashboard +
screenshots still in place).

Gate-shaped invariants, checked on the produced board.json:

- rows: **195** (100-4,000 OK) - 35 watchlist + 160 early
- ranks exactly 1..N: yes
- implied value non-increasing with rank: yes; **all 195 values distinct**
- watchlist coverage: **35/35** on the sample (sealed target: 40/40)
- every row pre-token, unique slug, implied a positive integer <= 1e14
- farm steps: 6 per row, 124-175 chars each (gate wants 3-12 steps,
  20-600 chars)
- peer stats: 121 tokenised peer protocols (excl. CEX), global median
  multiple **0.1996**; board rows by peer_source: category 97,
  category-shrunk 81, global 17 (before the cap fix run; distribution
  unchanged by the fix)

Top 10 by implied value (sample):

| # | Protocol | Category | TVL | Implied | Mult (source, peers) |
|---|----------|----------|-----|---------|----------------------|
| 1 | Steakhouse Financial | Risk Curators | $2.68B | $1.712B | 0.748 (shrunk, 1) |
| 2 | Gauntlet | Risk Curators | $1.41B | $0.869B | 0.748 (shrunk, 1) |
| 3 | Veda | Onchain Capital | $1.47B | $0.229B | 0.180 (shrunk, 2) |
| 4 | Nonce Capital | Risk Curators | $0.48B | $0.214B | 0.748 (shrunk, 1) |
| 5 | USDD | CDP | $0.99B | $0.185B | 0.224 (shrunk, 3) |
| 6 | RockawayX | Risk Curators | $0.26B | $0.143B | 0.748 (shrunk, 1) |
| 7 | Hyperithm | Risk Curators | $0.21B | $0.134B | 0.748 (shrunk, 1) |
| 8 | Hive Protocol | Chain | $0.18B | $0.129B | 0.806 (shrunk, 1) |
| 9 | K3 Capital | Risk Curators | $0.19B | $0.120B | 0.748 (shrunk, 1) |
| 10 | Upshift | Onchain Capital | $0.54B | $0.095B | 0.180 (shrunk, 2) |

For contrast, the unmodified starter on the same sample ranked the same
top 3 names but at a flat 0.25x multiple (Steakhouse $520M).

## Open questions for the dashboard lane

1. The starter `dashboard/app.js` recomputes each row with a single
   global `base_multiple` and flags a mismatch as stale data. With
   per-category peer multiples that recompute must use the row's own
   `peer_multiple` (now in data.js) plus growth/age/chain multipliers
   and the cap - please rewrite `impliedOf` accordingly, or drop the
   recompute and render board.json's breakdown directly.
2. Detail view: the full breakdown is in board.json, the compact subset
   in data.js. If the detail drawer wants `cap_usd`/`capped`/
   `base_value_usd` per row, say so and I will widen `radarRow` - it
   costs a few KB of data.js, no model change.
3. Risk Curators dominates the sample's top 10 because its single
   tokenised peer has a high ratio (category median ~2.7 before
   shrinkage). It is defensible (it follows from the snapshot) but if
   the dashboard wants to *show* model confidence, `peer_source` +
   `peer_count` are exposed precisely so thin-peer rows can be badged.
4. Screenshots and dashboard source are still the starter's: dossier is
   705 KB with them. Keep the final dashboard source under ~64 KB total
   (judge text cap) and screenshots ~300-350 KB each per PLAN.md.
5. Re-run everything against the sealed snapshot once the kit is
   re-downloaded: expected deltas are the peer medians (sealed data is
   2026-11-14, sample is 2026-11-19) and 40/40 coverage.
