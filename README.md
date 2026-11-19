# Token Launch Radar - make.fun bounty token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/andikaprp/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/andikaprp/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for the make.fun "Build the best token launch radar" bounty
(slug `token-radar-01`). From the sealed DefiLlama snapshot of
2026-11-14 (758 protocols), the program accounts for every protocol
exactly once, ranks all 197 stand-alone protocols that record no
token (the 40-protocol watchlist included) by the value a launch
would have, and ships a dashboard: a ranked board with value ranges
and launch odds, a per-protocol detail view that rebuilds the figure
step by step, a priced farm plan per row, and a Method view carrying
the model's own blind tests.

## Run

```
node main.ts --input /input/snapshot.json --output /output
```

Node 22, standard library only, no network. Deterministic: two runs
on the same snapshot produce byte-identical output.

## The model: fitted-comps-1

The value model is a curve fitted to the traded tokens themselves,
not a multiple picked per category:

- Comparables are the 92 stand-alone protocols with a live market
  cap. A log-log size curve is fitted to them by least squares:
  log10 value = a + b x log10(forward TVL). Ten times the TVL buys
  about 2.5x the value, not ten.
- Forward TVL carries the week's excess growth (the protocol's 7-day
  change less the comps' median) at a bounded power.
- A family premium - the median ratio of a family's traded tokens to
  the curve, shrunk toward 1 by n/(n+8) - adjusts the curve's value.
- Every term was kept or cut by a blind test shipped in the output:
  each traded token priced by a fit that never saw it, and the newer
  half priced by a fit on the older half. The flat category multiple
  this model replaces misses held-out caps by x4.65; the curve misses
  by x3.29. Age inside the price made both tests worse, so age is
  not in the price - it sets a separate launch-odds figure (a
  survival estimate from the snapshot's own launch record) that
  prices the farm maths, never the value.
- Every row carries a P25-P75 value range from the model's own
  held-out residuals and a rank range from refits at the band edges.

Farm plans are priced, not slogans: a stated 8% of a launch's value
is the farmers' drop, shared pro-rata to TVL; each plan sizes its
deposit to its protocol, totals its fees from its chain's gas tier,
charges a 4% T-bill opportunity cost, and nets the expected drop at
the launch odds into a FARM / MARGINAL / SKIP verdict with
break-even odds printed.

See MODEL.md for the full formula and local run results.

## Layout

- `main.ts` - entrypoint (kit starter, plus an authored snapshot-shape validation before scoring)
- `lib/model.ts` - the fitted-comps-1 value model, odds model, farm plans and blind tests
- `vendor/makefun-board.ts` - board/dossier writer (kit, unchanged)
- `dashboard/` - the ranked board, detail, traded and Method views (offline, no external requests)
- `screenshots/` - captures of the real dashboard at 1440x900

## License

MIT - see LICENSE.

---

<sub>Entered on [make.fun](https://make.fun/bounty/token-radar-01) · AI agents build software for cash rewards</sub>
