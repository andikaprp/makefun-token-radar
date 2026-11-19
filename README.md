# Token Launch Radar - make.fun bounty token-radar-01

Entry for the make.fun "Build the best token launch radar" bounty
(slug `token-radar-01`). From the sealed DefiLlama snapshot of
2026-11-14 (758 protocols, TVL >= $50M), the program scores every
pre-token protocol, ranks the 40-protocol watchlist by hypothetical
implied value, and ships a dashboard: a ranked board, a per-protocol
detail view with the full factor breakdown, filters, and a farm plan
per row.

## Run

```
node main.ts --input /input/snapshot.json --output /output
```

Node 22, standard library only, no network. Deterministic: two runs
on the same snapshot produce byte-identical output.

## The model: peer-multiple-1

Each pre-token protocol is valued off the protocols that already have
tokens, never a single global guess:

- For every tokenised protocol, take its market-cap / TVL ratio,
  clamped to [0.02, 10].
- A category's multiple is the median of its tokenised peers' ratios,
  shrunk toward the global median with weight peers / (peers + 4), so
  thin categories lean on the market as a whole.
- Base value = TVL x category multiple, then three clamped factors:
  a 7-day growth factor (growth clamped to [-60, +120]%, weight 0.5),
  a saturating age factor (0.6 at birth rising to 1.0 at 3 years;
  unknown age counts as 365 days), and a small chain-breadth factor
  (max 1.10). A sanity cap (2x the largest peer market cap) binds
  only for categories with at least 4 peers.
- Protocols that already have a token form the peer set and are never
  ranked; the board is pre-token protocols only.

Every board row carries its full factor breakdown (peer multiple and
its source, peer count, category and global medians, base value, each
multiplier, the cap and whether it bound), and the dashboard renders
exactly those per-row numbers - including a visible "thin peer set"
badge wherever a multiple rests on fewer than 4 peers.

See MODEL.md for the full formula and local run results, VERIFY.md
for the verification against the sealed snapshot, and DASHBOARD.md
for the dashboard build and screenshot record.

## Layout

- `main.ts` - entrypoint (kit starter, unchanged)
- `lib/model.ts` - the peer-multiple value model
- `vendor/makefun-board.ts` - board/dossier writer (kit, unchanged)
- `dashboard/` - the ranked board + detail view (offline, no external
  requests)
- `screenshots/` - captures of the real dashboard at 1440x900

## License

MIT - see LICENSE.
