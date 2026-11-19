# Value model - peer-multiple-2

Status: this is the model the entry now runs (`lib/model.ts`,
`MODEL_VERSION = 'peer-multiple-2'`). It replaces peer-multiple-1, which
was diagnosed and retired in the v2 improvement lane (full record in the
workspace's V2.md). Everything below is verified on the REAL sealed
snapshot (758 protocols, 40 watchlist, `as_of` 2026-11-14).

## Why model 1 was retired

Model 1 priced Risk Curators off a single tokenised peer: Api3, an
oracle token with a $35.0M market cap on $11.8M of TVL - a 2.9747x
mcap/TVL ratio. Shrinkage with k=4 blended that one print to 0.7917x,
still 3.2x the snapshot-wide median (0.2460x), and because Risk
Curators protocols hold genuinely large TVL, that one number priced 7
of the board's top 10 and 10 of the top 20 (Steakhouse Financial at a
$1.894B implied value, backed by a $35M peer). The dashboard badged
those rows "thin peer set - 1 peer", but the price itself carried no
discount. Model 1 also paid its maximum growth bonus (x1.60) to any
7-day TVL print above +120% - the snapshot contains a +4,448% print,
so three board rows sat at the cap on the noisiest figure available.

## Formula (model 2)

For every pre-token protocol (no mcap, no gecko_id, no symbol):

```
peer ratio    = mcap_usd / tvl_usd of each tokenised protocol, clamped to [0.02, 10]
category mult = median peer ratio in the protocol's category, shrunk toward
                the global median:  mult = w*catMedian + (1-w)*globalMedian,
                w = peers / (peers + 10)          (model 1: peers + 4)
evidence      = while a category has fewer than min_peers (4) peers, the
                shrunk multiple is multiplied by
                1 - 0.4 * (1 - peers/4):  x0.70 for 1 peer, x0.80 for 2,
                x0.90 for 3, x1.00 from 4 up. A category with no peers
                uses the global median outright (no category claim, no
                discount). New in model 2.
base          = tvl_usd * category mult * evidence
growthMult    = 1 + (clamp(change_7d, -50, +80) / 100) * 0.35
                (model 1: clamp [-60, +120] * 0.5, bonus up to x1.60;
                model 2 pays the noisy week less: at most x1.28)
ageMult       = 0.6 + min(age_days, 1095)/1095 * 0.4   (unknown age = 365)
chainMult     = 1 + 0.02 * min(chains - 1, 5)          (max 1.10)
cap           = 2 * largest tokenised peer mcap in the category, but only
                when that category has >= 4 peers; otherwise 2 * largest
                peer mcap in the whole snapshot (unchanged from model 1;
                it binds on 0 rows - a guard, not a ranking tool)
implied       = max(1, min(cap, round(base * growthMult * ageMult * chainMult)))
```

Constants live in `MODEL` in `lib/model.ts` (`shrink_k 10`,
`thin_discount_max 0.4`, `growth_weight 0.35`, `growth_floor/cap
-50/+80`; the rest unchanged). Peer set excludes CEX-category
protocols. No protocol name is special-cased anywhere; the watchlist
is read from the snapshot, and the board is watchlist + top-160
rankable pre-token protocols below the floor by TVL, sorted by implied
value, ties by slug.

## What changed on the sealed snapshot (model 1 -> model 2)

- Risk Curators multiple 0.7917 -> **0.3458** (shrunk 0.4941, then
  x0.70 evidence). Steakhouse $1.894B -> **$830M**, Gauntlet $1.128B ->
  $489M. Both stay #1/#2 - they are the two largest pre-token protocols
  in the snapshot - but at a multiple 56% lower.
- Top 10: Risk Curators **7 -> 5**; the top-3 sweep is broken (Veda #3,
  USDD #4, both nearly unchanged in value - the fix deflates the
  artefact, it does not promote favourites).
- Top 20: Risk Curators **10 -> 8**, across 9 categories (was 7);
  RWA grows 3 -> 4. Exits: Armitage (#16 -> #22), Noble (#19 -> #26),
  Keyrock (#20 -> #30). Entries: R25, Lightning Network, Saturn - all
  rows with full peer sets or the global median.
- The other one-peer high-median categories deflate the same way:
  Chain 0.8021 -> 0.3491 (Hive Protocol $142M -> $63M), Prediction
  Market and Collateral Management (medians pinned at the 10x clamp)
  2.1968 -> 0.7929.
- Board total implied value $6.32B -> $3.67B. Every thin row's fall is
  the same mechanism; the biggest movers are all Risk Curators / Chain
  rows dropping 45-58 places from the early-radar tail.
- Invariants hold: 200 rows, ranks 1..N, values non-increasing and
  **all 200 distinct**, watchlist 40/40, farm steps 6/row at 124-175
  chars, 0 capped rows, two runs byte-identical.

## Per-row factor breakdown

Every `board.json` row carries `model: FactorBreakdown`, now including
`shrunk_multiple` and `evidence_factor` alongside `peer_multiple` (the
applied, post-discount figure), `peer_source`, `peer_count`, both
medians, `base_value_usd`, the growth/age/chain multipliers, `cap_usd`
and `capped`. `data.js` rows carry the same fields, so the dashboard's
detail view shows the whole chain - category median 2.9747x -> shrunk
0.4941x -> evidence x0.7000 -> applied 0.3458x for Steakhouse - and its
recompute check still lands within rounding of the board's number.
Thin badges now carry the price of the thinness ("thin peer set - 1
peer, priced x0.70"). Live-token protocols stay out of the board
entirely: they are the peer set, and the dashboard's live view (24 by
mcap) shows their real market caps.
