# Dashboard - token-radar-01 (dashboard lane)

> Superseded: this records the v1/v2 dashboard. The current dashboard
> (board + detail + traded + Method views over the fitted-comps-1
> data) is described in MODEL.md and the workspace's V3.md.

Status: custom dashboard built, screenshots taken from the real rendered
page, full entry re-run and verified locally. Nothing submitted; no
account or repo created; Claude Code CLI not used. This lane closes the
dashboard items VERIFY.md left open (dashboard/model agreement,
dashboard byte cap, screenshot content).

## What was built (lane-build/dashboard/, starter dashboard replaced)

- **Ranked board** (app.js renders from data.js only): columns Rank,
  Protocol (name + slug), Category, Chains, TVL, 7d change, Age,
  Peer multiple, Implied value (bar scaled to the board leader), Set.
  Sortable: rank/implied, name, category, TVL, growth, age, multiple.
  Filters: search (name/slug/category/chain), category select, chain
  select, and a Watchlist / Early radar / All set toggle. A separate
  Live token tab shows the 24 set-aside tokenised protocols with real
  market caps and their mcap/TVL - the peer set, never mixed into the
  ranking.
- **Per-protocol detail view** (click/keyboard on any row, deep-linkable
  via `#p=<slug>`): the row's full factor breakdown - TVL, peer multiple
  with its source label, category median multiple, global median
  multiple, base value, clamped 7d growth and its multiplier, age and
  its multiplier, chain breadth and its multiplier, sanity cap and
  whether it bound, implied value - plus a recompute check line (below)
  and the farm plan, each step split into action / Cost / Time.
- **Confidence signalling**: every multiple carries a peer badge.
  `thin peer set - N peer(s)` (amber) when peer_count < the model's
  min_peers (4), `global median - no category peers` for the fallback,
  else `N peers`. A legend above the board explains the badges and
  counts them: 97 of 200 rows are thin on the sealed snapshot, including
  the whole Risk Curators top cluster (1 peer) - the caveat MODEL.md
  flagged is now visible wherever the number is.
- **Model panel**: the peer-multiple formula stated with the model's own
  constants (ratio clamp [0.02, 10], shrinkage peers/(peers+4), growth
  clamp [-60, +120] x 0.5, age 0.6 + min(age,1095)/1095 x 0.4, chain
  +0.02/extra chain max +0.10, cap 2x largest peer mcap), the peer-set
  size (119 tokenised protocols on the sealed snapshot) and the global
  median multiple (0.2460x).
- **Design**: dark "scope" theme - near-black green canvas, one phosphor
  accent, amber reserved for thin evidence, tabular numerals, system
  fonts only. No framework, no external files.

## The starter mismatch, fixed

The starter app.js recomputed every row from one global `base_multiple`
and flagged disagreements as stale data - wrong under peer-multiple-1.
The new app.js never recomputes from a global: each row renders its own
stored `peer_multiple` and multipliers. One additive model change made
that possible, exactly the widening MODEL.md open question 2 offered:

- `lib/model.ts`: `RadarRow`/`radarRow` now also carry `watchlist`,
  `peer_count`, `category_median_multiple`, `global_median_multiple`,
  `base_value_usd`, `growth_pct`, `cap_usd`, `capped` - all copied from
  the row's existing `FactorBreakdown`. No formula, constant or board
  logic changed. Proof: **board.json sha256 is unchanged** from
  VERIFY.md (`1679c7ba37652d...`) on the final runs.
- data.js grows 84,166 -> 120,044 bytes as a result (the breakdown now
  travels with each row). The detail view's recompute check uses the
  stored factors: 0/200 rows reproduce to the exact dollar and the max
  delta is **0.0334%** (Veda), because the stored factors are rounded
  to 4 decimals and the model's were not - the page says so in words
  next to the number rather than claiming an exact match.

## Gate-shaped numbers

- Dashboard source: index.html 455 + app.css 9,468 + app.js 27,784 =
  **37,707 bytes total**, under the 65,536-byte judge text cap with
  ~27.8 KB to spare. 3 files (caps: 400 files / 4 MiB).
- Offline: `grep http://|https://` over dashboard/ returns **zero**
  strings - no URL appears in any attribute, CSS, JS import, comment or
  visible text (the data source is named "DefiLlama protocol index",
  never linked).
- dossier.json on the final run: **875,690 bytes** (cap 1.5 MiB).

## Screenshots (lane-build/screenshots/, starter placeholders replaced)

A renderer existed after all: Playwright's chromium headless shell in
`~/.cache/ms-playwright/` (no package install needed). Shots are of the
real output dashboard + data.js at 1440x900, rendered from the entry's
own /output copy, then placed in lane-build/screenshots/ and re-run
through main.ts (output copies hash-identical to the repo files).

| File | Shows | Bytes | sha256 (first 12) |
|---|---|---|---|
| 1-board.png | Board top: lede facts (40/40, 200 rows), filters, thin badges, top 5 rows | 185,559 | 59fec23690c7 |
| 2-detail.png | Steakhouse Financial detail drawer: full breakdown, cap not bound, recompute note, farm plan | 248,708 | cdd444dd5fe5 |
| 3-filtered.png | Filtered view: category = Risk Curators + Watchlist set, "12 of 200 rows shown" | 193,132 | 80e6da12041e |

All 1440x900: long side = the 1440 cap, short side 900 >= 800, each
<= 512 KiB. Every figure visible in them matches board.json (spot-checked
against the agreement run below).

## Verification (final entry, kit sealed snapshot, Node v24.22.1)

- Two consecutive full runs **byte-identical** across the whole output
  dir (board.json, data.js, dashboard/, screenshots/, dossier.json).
- Board invariants re-checked on the final output: 200 rows, ranks
  exactly 1..N, values non-increasing and all distinct, watchlist
  coverage **40/40**, farm steps 6/row at 124-175 chars.
- **data.js vs board.json, row for row, all 200 rows**: rank, name,
  category, chains, TVL, change_7d, age, implied value and every
  breakdown field (peer multiple/source/count, both medians, base
  value, growth pct + multiplier, age/chain multipliers, cap, capped,
  watchlist flag) agree exactly. Top 10 implied values identical to
  VERIFY.md's table (Steakhouse $1,893,829,414 down to Clearstar
  $106,803,686).
- **Farm plans**: the page's generator (extracted from app.js and run
  against data.js rows) reproduces board.json's farm_steps strings
  **200/200 rows, byte-for-byte**.
- Live tab exercised via a throwaway auto-click copy in /tmp (shipped
  files untouched): renders the 24 live rows with the Mcap/TVL column.

## Remaining gaps (explicit)

- Grader-side checks still unverifiable locally, unchanged from
  VERIFY.md: the scorer's dossier rebuild byte-compare, the kit CLI
  `check`, and Node 22 sandbox behaviour (local runs are Node 24, <1 s).
- Screenshots are PNG at 186-249 KB - inside every cap, slightly under
  PLAN.md's ~300-350 KB sizing guidance; nothing in the gate rewards
  larger files, so they were left as rendered.
- Submission-side items (repo, transcript bundle, signing) untouched,
  per this lane's scope.
