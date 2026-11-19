# Value model - fitted-comps-1

Status: this is the model the entry now runs (`lib/model.ts`,
`MODEL_VERSION = 'fitted-comps-1'`). It replaces peer-multiple-2 (and
peer-multiple-1 before it). The diagnosis that retired the multiple
family is in the workspace's V3-RESEARCH.md: the dossiers at the top
of this competition do not price with category medians at all - they
fit a curve to the traded tokens and prove it on held-out data, on
the page. Everything below is verified on the REAL sealed snapshot
(758 protocols, 40 watchlist, `as_of` 2026-11-14).

## Universe (selectUniverse)

Every protocol is counted once, in cascade order: a live market cap
puts it in the traded set (128); a token on record without a live cap
(288, including 16 with a recorded cap of zero or less, which no log
fit may touch); then, of the rest, bridges (43), liquid staking and
restaking (43), exchange custody (42), versioned releases (12) and
wrapped-by-name (5) are set aside as other products wearing a
parent's token or a wrapper's. What remains - stand-alone, no token
on record - is ranked: 197 rows, all 40 watchlist slugs among them.
The ranked set runs to the snapshot's own $5M protocol floor; the
watchlist is the floor of the work, never its ceiling.

Comparables ("comps") are the stand-alone traded tokens: the traded
set less bridges, staking forms, custody, versioned and wrapped -
92 protocols, 70 of them dated. Comps are grouped into seven
families (Lending & credit 20, Trading venues 22, Vaults & yield 20,
RWA & stables 12, Chains & infra 10, Staking & restaking 4,
AI/NFTs & other 4).

## Value (fitCurve, familyPremium, launchValue)

```
forward TVL  = TVL x (1 + clamp(change_7d - median comp change, -60, +60) / 100) ^ 0.42
curve value  = 10 ^ (a + b x log10(forward TVL))        a = 3.9848, b = 0.3905 on this snapshot
launch value = curve value x family premium
family premium = 1 + (median residual ratio of the family's comps - 1) x n / (n + 8)
```

The curve is an ordinary least-squares fit of log10(market cap) on
log10(forward TVL) over the 92 comps. A Huber-robust refit was
tested and rejected (left-out miss x3.43 against x3.27). The
snapshot's median comp change is -9.11%, so a protocol standing
still gains forward TVL; the carry is bounded at +/-60 points of
excess and the exponent 0.42 is the value the blind test chose from
the grid 0.30 / 0.42 / 0.55.

## Blind tests (backtestModel, printed in the dossier)

Leave-one-out over the 92 comps, and a time split (fit on the older
half of the 70 dated comps, price the 35 newer):

| model | left out | within 3x | older->newer | within 3x |
|---|---|---|---|---|
| one flat multiple of TVL | x4.65 | 38% | x4.52 | 37% |
| + size curve | x3.27 | 46% | x2.11 | 57% |
| + growth carry | x3.23 | 46% | x2.10 | 57% |
| + family premium (the model) | x3.29 | 47% | x2.27 | 57% |
| + age inside the price (tested, not kept) | x3.39 | 47% | x3.10 | 43% |

The flat row fits the median multiple per fold, so it is the honest
form of the retired model class. The curve earns its place; growth
and the premium are inside the noise of 92 tokens and are kept
bounded for that reason; age in the price is the one clear negative
and is cut. The printed value band is the model's own left-out
residual band: P25-P75 x0.30 to x3.19, P10-P90 x0.09 to x10.88.
Fitted on the oldest half, the P25-P75 band caught 20 of 35 newer
caps (57% against the 50% it states) and P10-P90 caught 27 (77%
against 80%): a little narrow, stated as such on the page. Rank
ranges come from the same band: how many board values clear a row's
band edges.

## Launch odds (launchOdds)

The share of protocols recording a token rises with tracked age
toward an ever-rate read off the oldest cohort (79.7%). A category's
own ever-rate is corrected for its age mix (its members' expected
completion under the snapshot-wide curve), shrunk toward the global
rate by n/(n+10), and floored at 8 members. The odds a launch is
still to come are the survival form E(1-F)/(1-EF), F the share of
its launches this age has already used, clamped to [0.10, 0.95].
Undated protocols are read at 365 days. The odds never multiply the
headline value; they price the expected drop in the farm maths.

## Farm plans (farmPlan)

A stated 8% of a launch's value is the farmers' drop, shared
pro-rata to TVL. Each plan: a fresh wallet on the protocol's first
listed chain, the contract and token check on the protocol's own
page, a deposit sized to the protocol (TVL x 1e-5, $250 to $25,000,
two significant figures), weekly qualifying actions across a hold of
30 / 45 / 60 days by tracked age, a dated review with a stop at 70%
of snapshot TVL, and an exit step. Fees are totalled from the
chain's gas tier ($0.05-$7.50 per transaction by chain class, $0.50
default). The net is the expected slice at the launch odds, less
fees, less a 4% T-bill charge on the deposit for the hold. Verdicts:
FARM at net >= $5, MARGINAL within $5, else SKIP - 24 / 79 / 94 on
this snapshot. Break-even odds (the launch chance at which costs are
exactly covered) are printed per row, and the dashboard re-prices
every plan at $1,000 and $10,000 deposits on request.

## Board on this snapshot

197 rows, all implied values distinct, total $1,933,240,225. Top:
Bittensor dTAO $38.7M (odds 92%), Polymarket International $36.6M
(odds 10%), BitFi Basis $30.9M. The large Risk Curators vaults price
in the $20-30M range off the curve and mostly SKIP: at the $25,000
deposit cap the T-bill charge on a huge-TVL slice outweighs the
expected drop, which is the model's honest arithmetic, not a badge.
