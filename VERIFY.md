# Verification - peer-multiple-1 against the REAL sealed snapshot

> Superseded: this records the v1 model's verification. The current
> model is fitted-comps-1 - see MODEL.md; its blind tests ship in the
> dossier itself (data.js `backtest`) and are re-derived in the
> browser by the dashboard's checkBoard().

Run: 2026-11-19, Muse subagent (verification lane). Nothing submitted; no
account or repo created; the kit's `cli/makefun.mjs` was not run.
Code verified: `lane-build/main.ts` + `lib/model.ts` (peer-multiple-1),
unmodified. Node v24.22.1 on this VM (grader uses Node 22).

## Snapshot facts (kit re-downloaded to `../kit/`, persistent)

Kit: `https://make.fun/c/token-radar-01/kit`, extracted to
`~/workspace/makefun/token-radar/kit/token-radar-01-kit/`.
Snapshot: `input/snapshot.json` (243 KB).

- `as_of`: **2026-11-14**
- `source`: DefiLlama https://api.llama.fi/protocols, fetched 2026-11-14T01:18:33.201Z
- `floor_usd`: 50,000,000
- protocols: **758**
- watchlist: **40 slugs**, every one present in `protocols`
  (armitage-by-wintermute, axis, b14g, bittensor-dtao, clearstar,
  curvance, doppler-finance, ember, firelight, galaxy-curation,
  gami-labs, gauntlet, hive-protocol, hyperithm, infinifi, k3-capital,
  keyrock, lagoon, lightning-network, lofty, mezo-earn, noble,
  nonce-capital, onre, opentrade, plume-vaults, r25, reti-pooling,
  rockawayx, saturn, steakhouse-financial, symbiotic, tori-finance,
  tulipa-capital, tydro, upshift, usdd, valos, veda, yuzu-money)
- protocol fields exactly the documented ten:
  slug, name, category, chains, tvl_usd, change_7d, mcap_usd, listed_at,
  gecko_id, symbol

## Run + determinism

`node main.ts --input <kit snapshot> --output <scratch>` twice:

- stdout: 758 protocols, 40 watchlist, **200 rows scored**
  (160 early, 24 live set aside)
- **Two runs byte-identical** (`diff -r` clean). sha256:
  - board.json `1679c7ba37652d1562a52e9ecd650868e727033fc2dc75ed4edae2b710d4b60c`
  - data.js `5d546c68f52f41e3eb7e8d8beb2c5dcbc7fa72b5c55a164a178f7`
  - dossier.json `1c30cf47decc87e68138c2d3dc2096a65e1f9e14ac14bbaf3302b9f2771b620d`
- dossier.json: 705,011 bytes (gate cap 1.5 MiB - OK)

## Board invariants (all PASS)

| Check | Result |
|---|---|
| Rows 100-4,000 | **200** OK |
| Ranks exactly 1..N | yes |
| Implied value non-increasing with rank | yes |
| Not all equal | **200 distinct values** |
| Watchlist coverage | **40/40**, none missing |
| Farm steps per row | 6 per row (gate 3-12) |
| Farm step length | 124-175 chars (gate 20-600) |
| Unique slugs | yes |
| Implied positive integers | yes |
| All rows pre-token (mcap/gecko null) | yes |
| Rows capped by the sanity cap | 0 |
| Peer source distribution | category 103, category-shrunk 83, global 14 |

## Top 10 on the sealed snapshot

| # | Protocol | Category | TVL | Implied | Mult (source, peers) |
|---|---|---|---|---|---|
| 1 | Steakhouse Financial | Risk Curators | $2.754B | $1.894B | 0.7917 (shrunk, 1) |
| 2 | Gauntlet | Risk Curators | $1.578B | $1.128B | 0.7917 (shrunk, 1) |
| 3 | Nonce Capital | Risk Curators | $0.514B | $0.243B | 0.7917 (shrunk, 1) |
| 4 | Veda | Onchain Capital Allocator | $1.563B | $0.234B | 0.1707 (shrunk, 2) |
| 5 | USDD | CDP | $1.056B | $0.190B | 0.2129 (shrunk, 3) |
| 6 | RockawayX | Risk Curators | $0.293B | $0.172B | 0.7917 (shrunk, 1) |
| 7 | Hyperithm | Risk Curators | $0.222B | $0.151B | 0.7917 (shrunk, 1) |
| 8 | Hive Protocol | Chain | $0.199B | $0.142B | 0.8021 (shrunk, 1) |
| 9 | K3 Capital | Risk Curators | $0.208B | $0.138B | 0.7917 (shrunk, 1) |
| 10 | Clearstar | Risk Curators | $0.162B | $0.107B | 0.7917 (shrunk, 1) |

## Vs the sample run in MODEL.md (live DefiLlama, 2026-11-19)

Same model, different data vintage (sealed is 2026-11-14). 9 of the
sample's top 10 stay in the top 10; the moves:

- **Nonce Capital #4 -> #3, Veda #3 -> #4 (swap, thin margin).**
  Nonce implied $0.214B -> $0.243B on higher sealed TVL ($0.48B ->
  $0.514B). Veda is nearly flat ($0.229B -> $0.234B): its TVL is higher
  in the sealed snapshot ($1.47B -> $1.563B) but its category multiple
  fell (0.180 -> 0.1707), cancelling the gain. Gap is only ~4%, so this
  order is data-vintage-sensitive, not a model change.
- **Gauntlet pulls away at #2: $0.869B -> $1.128B (+30%).** Sealed TVL
  is higher ($1.41B -> $1.578B) and its 7d growth multiplier is positive
  (1.0282) in the sealed data.
- **Steakhouse #1 grows: $1.712B -> $1.894B (+11%).** TVL $2.68B ->
  $2.754B plus a slightly richer Risk Curators multiple (0.748 ->
  0.7917; the global median multiple is 0.246 sealed vs 0.1996 sample).
- **Clearstar enters at #10; Upshift drops #10 -> #11.** Upshift's
  implied slips ($0.095B -> $0.084B: TVL $0.54B -> $0.499B, same soft
  Onchain Capital multiple), while Clearstar rides the high Risk
  Curators multiple (0.7917) on $162M TVL to $0.107B.
- **Risk Curators dominance grows: 7 of the top 10** (6 on the sample).
  Same known caveat as MODEL.md: that category's multiple rests on a
  single tokenised peer, shrunk toward the global median. It follows
  from the snapshot, but the top of the board is only as solid as that
  one peer's ratio.

No code changed between the runs, so every delta above is data, not
model drift. The cap fix from lane D holds on the real data: 0 capped
rows, no flattening at the top.

## Gate items NOT verified locally (explicit)

Measured where possible, but not gate-verified here:

- **Screenshots - content.** Files copied into the output measure
  in-caps (3 files, 1440x900 each: long side = 1440 cap, short side
  900 >= 800; 148K / 219K / 138K, all <= 512 KiB), but they are still
  the kit starter's placeholders in `lane-build/screenshots/`, not
  captures of the final dashboard. The dashboard lane owns replacing
  them; screenshot-to-dashboard agreement is unverifiable until then.
- **Dashboard byte caps / judge text cap.** Dashboard source totals
  29,543 bytes (index.html 448 + app.css 8,007 + app.js 21,088) and
  contains no `http`/`https` strings, and `buildDossier` was invoked
  with the starter's `text_max_bytes: 65,536`. But `data.js` is 84,166
  bytes on its own, and how the grader's text extraction weighs
  data.js + dashboard + dossier together is grader-side; not verified.
- **Dossier byte-identical rebuild by the grader.** Verified: our own
  two runs produce identical dossier bytes. Not verified: the scorer
  rebuilding `dossier.json` from the submitted /output in its sandbox
  and matching bytes (that rebuild, and the kit CLI's `check`, were
  out of scope / not run by this lane).
- **Sandbox environment.** Grader runs Node 22, read-only /bot and
  /input, 1 CPU / 1 GB / 120 s. Local run was Node v24.22.1, finished
  in under a second; Node 22 type-stripping behaviour and the sandbox
  mounts were not exercised here.
- **Dashboard behaviour.** Whether `dashboard/app.js`'s recompute /
  detail view agrees with the per-category peer multiples (MODEL.md
  open questions 1-2) is a dashboard-lane item; this lane verified
  the model's outputs only.
- **Submission-side checks.** Entry signature, account wallet,
  transcript bundle and quota checks happen at submit time and were
  not touched (nothing was submitted).
