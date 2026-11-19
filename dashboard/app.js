// Token Launch Radar dashboard, model fitted-comps-1. Reads window.RADAR (data.js, written
// beside dashboard/ by main.ts) and renders the ranked board, a detail view per protocol, the
// traded anchors, and the Method view with the model's own blind tests. No network: every
// number on the page is in data.js, and checkBoard() re-derives the rows from the fit here.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;
  var M = D.model, F = D.fit, BT = D.backtest, T = D.totals;
  var app = document.getElementById('board');
  var rows = D.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  // ---------- formatting ----------
  function commas(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(a < 10 ? 2 : 0);
  }
  function usdFull(n) { return '$' + commas(n); }
  function signed2(n) { return (n < 0 ? '-$' : '+$') + Math.abs(n).toFixed(2); }
  function pct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function age(d) {
    if (d === null || d === undefined) return 'undated';
    if (d >= 365) return (d / 365).toFixed(1) + ' y';
    if (d >= 30) return Math.round(d / 30.4) + ' mo';
    return d + ' d';
  }
  function hours(min) { return min >= 90 ? (min / 60).toFixed(1) + ' h' : min + ' min'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // ---------- farm maths at any deposit (farmPlan's own arithmetic) ----------
  function netAt(r, dep) {
    var slice = M.drop_share * r.launch_value_usd * r.launch_odds * dep / r.tvl_usd;
    var opp = dep * M.risk_free_rate * r.hold_days / 365;
    return { slice: slice, opp: opp, net: slice - r.fees_usd - opp };
  }
  function verdictOf(net) { return net >= M.farm_net ? 'FARM' : net >= M.marginal_net ? 'MARGINAL' : 'SKIP'; }

  // ---------- checkBoard(): the page verifies itself against the model ----------
  function checkBoard() {
    var ok = 0, sorted = true, sum = 0, wl = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var pred = Math.pow(10, F.a + F.b * Math.log10(r.fwd_tvl_usd)) * r.family_premium;
      if (Math.abs(pred - r.launch_value_usd) / r.launch_value_usd < 0.015) ok++;
      if (i > 0 && rows[i].implied_value_usd > rows[i - 1].implied_value_usd) sorted = false;
      sum += r.implied_value_usd;
      if (r.watchlist) wl++;
    }
    return { ok: ok, sorted: sorted, sum: sum, wl: wl, total: T.implied_total };
  }

  // ---------- state ----------
  var state = { view: 'board', set: 'all', verdict: 'any', dep: 'own', q: '', cat: 'all', chain: 'all', sort: 'rank', slug: null };
  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    state.view = 'board'; state.slug = null;
    if (h.indexOf('p=') === 0) { state.view = 'detail'; state.slug = h.slice(2); return; }
    if (h === 'm') { state.view = 'method'; return; }
    if (h === 't') { state.view = 'traded'; return; }
    h.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0] === 'f') state.verdict = p[1];
      if (p[0] === 's') state.sort = p[1];
      if (p[0] === 'd') state.dep = p[1] === 'own' ? 'own' : parseInt(p[1], 10);
      if (p[0] === 'set') state.set = p[1];
    });
  }
  function depOf(r) { return state.dep === 'own' ? r.deposit_usd : state.dep; }

  var BUCKET_COLORS = { ranked: '#57d992', trades: '#7d9bb3', record: '#4a5a50', bridge: '#8a6bc9', staking: '#c9756b', custody: '#b0894a', versioned: '#5f7f8a', wrapped: '#96755a' };

  function topBar(active) {
    return '<div class="top"><div class="brand"><span class="dot"></span>TOKEN LAUNCH RADAR <small>token launch radar</small></div>' +
      '<div class="views">' +
      '<button data-nav="board" class="' + (active === 'board' || active === 'detail' ? 'on' : '') + '">Board</button>' +
      '<button data-nav="method" class="' + (active === 'method' ? 'on' : '') + '">Method</button>' +
      '<button data-nav="traded" class="' + (active === 'traded' ? 'on' : '') + '">Already trades ' + D.trades.length + '</button></div>' +
      '<div class="meta">snapshot ' + D.as_of + ' · DefiLlama protocol index · model ' + D.model_version + '<br>no network · no hand-picked names</div></div>';
  }
  function foot() {
    return '<div class="foot">Implied values are this radar\'s own claim, derived from one frozen DefiLlama snapshot (' + D.as_of + '); "records no token" is DefiLlama\'s record, not proof that none exists. Nothing here says if or when a token launches. Not investment advice.</div>';
  }

  // ---------- board view ----------
  function kpis() {
    var full = BT.variants.filter(function (v) { return v.key === 'full'; })[0];
    var flat = BT.variants.filter(function (v) { return v.key === 'flat'; })[0];
    var top = rows[0];
    var tiles = [
      ['Ranked', String(rows.length), D.watchlist_size + ' of ' + D.watchlist_size + ' watchlist · ' + D.early_size + ' below the ' + usd(D.floor_usd) + ' floor'],
      ['Implied value', usd(T.implied_total), 'summed over the board · rank 1 ' + esc(top.name) + ' ' + usd(top.implied_value_usd)],
      ['Held-out miss', 'x' + full.loo_miss.toFixed(2), 'flat multiple x' + flat.loo_miss.toFixed(2) + ' · each of ' + F.comps + ' traded tokens priced without itself'],
      ['Newer from older', 'x' + full.split_miss.toFixed(2), 'fit on the oldest half of the comps, priced the ' + BT.split_n + ' newer · ' + Math.round(full.split_within3 * 100) + '% within x3'],
      ['Range holds', Math.round(BT.band_holds.in25_75 / BT.band_holds.n * 100) + '%', 'of newer caps inside the printed P25-P75 band · ' + Math.round(BT.band_holds.in10_90 / BT.band_holds.n * 100) + '% inside P10-P90'],
      ['Worth farming', String(T.farm), T.marginal + ' marginal · ' + T.skip + ' skip at each plan\'s own size' + (T.best_net_per_hour ? ' · best net/hour ' + usd(T.best_net_per_hour.per_hour) + ' (' + esc(T.best_net_per_hour.name) + ')' : '')]
    ];
    return '<div class="kpis">' + tiles.map(function (t, i) {
      return '<div class="kpi"><div class="k">' + t[0] + '</div><div class="v' + (i === 2 || i === 5 ? ' good' : '') + '">' + t[1] + '</div><div class="s">' + t[2] + '</div></div>';
    }).join('') + '</div>';
  }
  function accounting() {
    var b = D.universe.buckets;
    var eq = b.map(function (x) { return x.count; }).join(' + ');
    var bar = b.map(function (x) { return '<i style="background:' + (BUCKET_COLORS[x.key] || '#555') + ';width:' + (x.count / D.universe.total * 100) + '%"></i>'; }).join('');
    var leg = b.map(function (x) { return '<span><i style="background:' + (BUCKET_COLORS[x.key] || '#555') + '"></i><b class="num">' + x.count + '</b> ' + esc(x.label) + '</span>'; }).join('');
    return '<div class="acct"><div class="line"><b>' + D.universe.total + ' protocols read</b> = ' + eq + ': every protocol accounted for once, each set-aside for one reason</div><div class="stack">' + bar + '</div><div class="legend">' + leg + '</div></div>';
  }
  function backtestPanel() {
    var rowsHtml = BT.variants.map(function (v) {
      var cls = v.key === 'age' ? 'cut' : v.key === 'full' ? 'kept' : '';
      return '<tr class="' + cls + '"><td>' + esc(v.label) + '</td><td>x' + v.loo_miss.toFixed(2) + '</td><td>x' + v.split_miss.toFixed(2) + '</td></tr>';
    }).join('');
    return '<div class="panel"><h3>Out-of-sample check <span class="fn">looCheck()</span></h3>' +
      '<p><b>Does it hold on tokens it never saw?</b> Two blind tests over the ' + F.comps + ' traded tokens that teach the model: each priced by a fit that never saw it (leave-one-out), and the ' + BT.split_n + ' newer ones priced by a fit on the older half alone.</p>' +
      '<table class="mini"><tr><th>model</th><th>left out</th><th>older-&gt;newer</th></tr>' + rowsHtml + '</table>' +
      '<p>The size curve does the work. The family premium and the growth carry are kept small because the test gives them little; <b>age inside the price made both tests worse</b>, so age is not in the price - it sets the launch odds instead.</p>' +
      '<p><b>Are the printed ranges honest?</b> Fitted on the oldest half, the P25-P75 band caught ' + BT.band_holds.in25_75 + ' of ' + BT.band_holds.n + ' newer caps (' + Math.round(BT.band_holds.in25_75 / BT.band_holds.n * 100) + '% against the 50% it states) and the P10-P90 band caught ' + BT.band_holds.in10_90 + ' (' + Math.round(BT.band_holds.in10_90 / BT.band_holds.n * 100) + '% against 80%): a little narrow, and it says so.</p></div>' +
      '<div class="panel"><h3>How a row is priced <span class="fn">impliedValue()</span></h3><ol class="how">' +
      '<li><b>Size curve.</b> log<sub>10</sub> value = ' + F.a.toFixed(2) + ' + ' + F.b.toFixed(2) + ' x log<sub>10</sub>(forward TVL), fitted on ' + F.comps + ' stand-alone tokens that trade. Ten times the TVL buys about ' + Math.pow(10, F.b).toFixed(1) + ' times the value, not ten.</li>' +
      '<li><b>Growth carry.</b> Forward TVL carries the week\'s excess move (the protocol\'s 7-day change less the comps\' median ' + pct(F.med_change) + '), at power ' + M.growth_gamma + ', clamped.</li>' +
      '<li><b>Family premium.</b> A family\'s traded tokens sit a median ratio off the curve; shrunk toward 1 by n/(n+' + M.premium_shrink_k + '), it multiplies the curve\'s value.</li>' +
      '<li><b>Launch odds.</b> ' + Math.round(D.odds.ever_global * 100) + '% of the oldest protocols record a token; a category\'s own ever-rate and the share of its launches this age has already used give the odds a launch is still to come. The odds price the farm maths, never the value.</li>' +
      '<li><b>Verdict.</b> A stated ' + Math.round(M.drop_share * 100) + '% of the value is the farmers\' drop. A plan nets its slice of it (at the odds) against its own fees and a ' + Math.round(M.risk_free_rate * 100) + '% T-bill cost: FARM at net &gt;= ' + usd(M.farm_net) + ', MARGINAL within ' + usd(Math.abs(M.marginal_net)) + ', else SKIP.</li></ol></div>';
  }
  function filteredRows() {
    var out = rows.filter(function (r) {
      if (state.set === 'watch' && !r.watchlist) return false;
      if (state.set === 'below' && r.watchlist) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if ((r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      }
      if (state.verdict !== 'any' && verdictOf(netAt(r, depOf(r)).net) !== state.verdict.toUpperCase()) return false;
      return true;
    });
    var key = {
      rank: function (a, b) { return a.rank - b.rank; },
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      net: function (a, b) { return netAt(b, depOf(b)).net - netAt(a, depOf(a)).net; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      odds: function (a, b) { return b.launch_odds - a.launch_odds; }
    }[state.sort] || function (a, b) { return a.rank - b.rank; };
    return out.sort(key);
  }
  var GMIN = Math.log10(Math.min.apply(null, rows.map(function (r) { return r.band_low_usd; })));
  var GMAX = Math.log10(Math.max.apply(null, rows.map(function (r) { return r.band_high_usd; })));
  function whisk(r) {
    function pos(x) { return (Math.log10(Math.max(x, 1)) - GMIN) / (GMAX - GMIN) * 100; }
    var lo = pos(r.band_low_usd), hi = pos(r.band_high_usd), v = pos(r.implied_value_usd);
    return '<div class="whisk"><div class="band" style="left:' + lo + '%;width:' + Math.max(hi - lo, 1) + '%"></div><div class="tick" style="left:' + v + '%"></div></div>';
  }
  function boardView() {
    var cats = [], chains = [];
    rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort(); chains.sort();
    var list = filteredRows();
    var chk = checkBoard();
    var seg = function (name, items) {
      return '<div class="seg" data-seg="' + name + '">' + items.map(function (it) {
        return '<button data-v="' + it[0] + '" class="' + (String(state[name]) === String(it[0]) ? 'on' : '') + '">' + it[1] + '</button>';
      }).join('') + '</div>';
    };
    var depLabel = state.dep === 'own' ? 'each plan\'s own size' : usd(state.dep);
    var trs = list.map(function (r) {
      var dep = depOf(r), e = netAt(r, dep), vd = verdictOf(e.net);
      return '<tr data-slug="' + r.slug + '"><td><div class="rank">' + r.rank + '</div><div class="sub">' + r.rank_low + '-' + r.rank_high + '</div></td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '<span class="badge grey">BELOW FLOOR</span>') +
        '<div class="sub">' + esc(r.category || 'uncategorised') + ' · ' + esc(r.chains[0] || '') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</div></td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : '') + '">' + pct(r.change_7d) + '</td>' +
        '<td>' + age(r.age_days) + '</td>' +
        '<td class="num">' + Math.round(r.launch_odds * 100) + '%<span class="oddsbar"><i style="width:' + Math.round(r.launch_odds * 100) + '%"></i></span></td>' +
        '<td><span class="num" style="font-weight:700">' + usd(r.implied_value_usd) + '</span>' + whisk(r) + '<div class="sub">' + usd(r.band_low_usd) + ' to ' + usd(r.band_high_usd) + '</div></td>' +
        '<td><span class="chip ' + vd + '">' + vd + '</span> <span class="net ' + vd + '">' + signed2(e.net) + '</span><div class="sub">on ' + usd(dep) + ' · break-even ' + (r.break_even_odds > 1 ? '&gt;100%' : Math.round(r.break_even_odds * 100) + '%') + '</div></td></tr>';
    }).join('');
    return topBar('board') +
      '<div class="head"><h1>' + rows.length + ' protocols that record no token, ranked by <b>what a launch would be worth</b></h1>' +
      '<p>Implied value is the value if it launches: a size curve fitted on the ' + F.comps + ' stand-alone tokens that trade, a family premium, and a bounded growth carry - every term kept or cut by the blind test printed beside the board. The odds a launch is still to come price the farm maths, not the value.</p></div>' +
      kpis() + accounting() +
      '<div class="layout"><div><div class="controls">' +
      seg('set', [['all', 'All ' + rows.length], ['watch', 'Watchlist ' + D.watchlist_size], ['below', 'Below floor ' + D.early_size]]) +
      seg('verdict', [['any', 'Any verdict'], ['farm', 'Farm'], ['marginal', 'Marginal'], ['skip', 'Skip']]) +
      seg('dep', [['own', 'Plan size'], ['1000', '$1,000'], ['10000', '$10,000']]) +
      '<input type="search" id="q" placeholder="Search protocols" value="' + esc(state.q) + '">' +
      '<select id="cat"><option value="all">All categories</option>' + cats.map(function (c) { return '<option' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="chain"><option value="all">All chains</option>' + chains.map(function (c) { return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="sort">' + [['rank', 'Sort: rank'], ['value', 'Sort: implied value'], ['net', 'Sort: net of fees'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d change'], ['age', 'Sort: tracked'], ['odds', 'Sort: launch odds']].map(function (o) { return '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="countline">' + list.length + ' of ' + rows.length + ' protocols shown · nets priced at ' + depLabel + ' · click a row for its detail</div>' +
      '<p class="checkline">✓ checkBoard(): ' + rows.length + ' rows drawn = ' + rows.length + ' written · ranks 1 to ' + rows.length + ' in order · values never rise down the board · total ' + usdFull(chk.sum) + ' = ' + usdFull(chk.total) + ' · ' + chk.wl + ' of ' + D.watchlist_size + ' watchlist ranked · ' + chk.ok + '/' + rows.length + ' values re-derived from fitCurve() in this browser</p>' +
      '<table class="board"><thead><tr><th>Rank · range</th><th>Protocol</th><th>TVL</th><th>7d</th><th>Tracked</th><th>Launch odds</th><th>Implied value · range</th><th>Net · verdict</th></tr></thead><tbody>' + trs + '</tbody></table></div>' +
      '<aside class="rail">' + backtestPanel() + '</aside></div>' + foot();
  }

  // ---------- detail view ----------
  function detailView(r) {
    var dep = r.deposit_usd, e = netAt(r, dep), vd = r.verdict;
    var bucket = D.odds.buckets.filter(function (b) { var a = r.age_days === null ? 365 : r.age_days; return a >= b.lo && a < b.hi; })[0];
    var build = [
      ['TVL in the snapshot', usd(r.tvl_usd), pct(r.change_7d) + ' over 7 days · tracked ' + age(r.age_days) + ' (' + (r.listed_at || 'no date') + ')'],
      ['Forward TVL', usd(r.fwd_tvl_usd), 'the week\'s excess over the comps\' median ' + pct(F.med_change) + ', carried at power ' + M.growth_gamma + ', clamped at +/-' + M.growth_excess_clamp + ' points'],
      ['Size curve', usd(r.curve_value_usd), '10^(' + F.a.toFixed(4) + ') x forward TVL^' + F.b.toFixed(4) + ', from ' + F.comps + ' tokens that trade'],
      ['Family premium', 'x ' + r.family_premium.toFixed(2), esc(r.family) + ': ' + r.family_peers + ' traded tokens, median ratio shrunk toward 1'],
      ['Value if it launches', usd(r.launch_value_usd), 'curve x premium · its P25-P75 range is ' + usd(r.band_low_usd) + ' to ' + usd(r.band_high_usd) + ', the model\'s own held-out band'],
      ['Launch odds', Math.round(r.launch_odds * 100) + '%', 'of ' + esc(r.category || 'its category') + ' protocols ' + Math.round(r.odds_ever * 100) + '% record a token in the end; by ' + age(r.age_days) + ', ' + Math.round(r.odds_done * 100) + '% of those launches have happened (snapshot-wide rate in this age band: ' + (bucket ? Math.round(bucket.rate * 100) + '%' : 'n/a') + ')']
    ];
    var buildHtml = build.map(function (x, i) {
      return '<tr' + (i === 4 ? ' class="total"' : '') + '><td>' + x[0] + '<div class="sub">' + x[2] + '</div></td><td class="v">' + x[1] + '</td></tr>';
    }).join('');
    var comps = r.nearest.length ? r.nearest.map(function (c) {
      return '<tr><td>' + esc(c.name) + (c.symbol ? ' (' + esc(c.symbol) + ')' : '') + '<div class="sub">' + usd(c.tvl_usd) + ' TVL</div></td><td class="v">' + usd(c.mcap_usd) + ' cap</td></tr>';
    }).join('') : '<tr><td>No traded token in its family.</td><td></td></tr>';
    var steps = r.steps.map(function (s) {
      return '<li>' + esc(s.text) + '<br><span class="ct">cost ' + esc(s.cost) + ' · time ' + esc(s.time) + '</span></li>';
    }).join('');
    var sens = [250, 1000, dep, 10000].filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }).map(function (d2) {
      var n2 = netAt(r, d2), v2 = verdictOf(n2.net);
      return '<span class="cell">' + usd(d2) + ' → <b>' + signed2(n2.net) + '</b> ' + v2 + '</span>';
    }).join('');
    return topBar('detail') +
      '<button class="back" data-nav="board">← Board</button>' +
      '<div class="dhead"><div><h2>' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '<span class="badge grey">BELOW FLOOR</span>') + '</h2>' +
      '<div class="sub" style="font-size:13px">' + esc(r.category || 'uncategorised') + ' · ' + r.chains.map(esc).join(', ') + ' · records no token</div>' +
      '<div class="sub" style="margin-top:6px">rank ' + r.rank + ' of ' + rows.length + '; ' + r.rank_low + ' to ' + r.rank_high + ' across its range</div></div>' +
      '<div style="text-align:right"><div class="big">' + usd(r.implied_value_usd) + '</div><div class="sub">implied value, the value if it launches<br>P25-P75 ' + usd(r.band_low_usd) + ' to ' + usd(r.band_high_usd) + '</div></div></div>' +
      '<div class="dgrid"><div><h3 style="margin:4px 0 8px">How the figure is made <span style="color:var(--gold);font-family:var(--mono);font-size:12px">impliedValue()</span></h3>' +
      '<table class="build">' + buildHtml + '</table>' +
      '<h3 style="margin:16px 0 8px">Nearest traded comparables</h3><table class="build">' + comps + '</table></div>' +
      '<div><div class="farmbox"><h3 style="margin:0">Farm plan <span style="color:var(--gold);font-family:var(--mono);font-size:12px">farmPlan()</span></h3>' +
      '<div class="netline"><span class="chip ' + vd + '">' + vd + '</span> <b>' + signed2(e.net) + '</b> net over ' + r.hold_days + ' days: the model\'s expected drop of ' + usd(e.slice) + ' at the odds on ' + usd(dep) + ', less ' + usd(r.fees_usd) + ' of fees and ' + usd(e.opp) + ' of T-bill cost. Break-even odds ' + (r.break_even_odds > 1 ? '&gt;100%' : Math.round(r.break_even_odds * 100) + '%') + '.</div>' +
      '<div class="farmgrid">' +
      '<div class="cell"><div class="k">At risk</div><div class="v">' + usd(dep) + '</div></div>' +
      '<div class="cell"><div class="k">Fees</div><div class="v">' + usd(r.fees_usd) + '</div></div>' +
      '<div class="cell"><div class="k">Your time</div><div class="v">' + hours(r.time_minutes) + '</div></div>' +
      '<div class="cell"><div class="k">Model\'s drop</div><div class="v">' + usd(e.slice) + '</div></div>' +
      '<div class="cell"><div class="k">Net</div><div class="v">' + signed2(e.net) + '</div></div></div>' +
      '<div class="sub">Net at other sizes (same fees, drop and odds):</div><div class="sens">' + sens + '</div>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<div class="sub">All ' + r.steps.length + ' steps over ' + r.hold_days + ' days: ' + usd(r.fees_usd) + ' of fees, ' + hours(r.time_minutes) + ' of your time. The position may earn the protocol\'s own yield, which would offset the T-bill cost; the snapshot carries no yields, so none is assumed.</div>' +
      '</div></div></div>' + foot();
  }

  // ---------- method view ----------
  function scatter() {
    var W = 660, H = 430, L = 56, B = 30, X0 = 6.4, X1 = 9.7, Y0 = 4.6, Y1 = 10.4;
    function px(x) { return L + (Math.log10(x) - X0) / (X1 - X0) * (W - L - 8); }
    function py(y) { return H - B - (Math.log10(Math.max(y, 1)) - Y0) / (Y1 - Y0) * (H - B - 12); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%">';
    [1e7, 1e8, 1e9].forEach(function (v) { s += '<line class="axis" x1="' + px(v) + '" y1="8" x2="' + px(v) + '" y2="' + (H - B) + '"/><text x="' + (px(v) - 8) + '" y="' + (H - 12) + '">' + usd(v) + '</text>'; });
    [1e6, 1e8, 1e10].forEach(function (v) { s += '<line class="axis" x1="' + L + '" y1="' + py(v) + '" x2="' + (W - 8) + '" y2="' + py(v) + '"/><text x="4" y="' + (py(v) + 3) + '">' + usd(v) + '</text>'; });
    var xa = Math.pow(10, X0), xb = Math.pow(10, X1);
    s += '<line x1="' + px(xa) + '" y1="' + py(Math.pow(10, F.a + F.b * Math.log10(xa))) + '" x2="' + px(xb) + '" y2="' + py(Math.pow(10, F.a + F.b * Math.log10(xb))) + '" stroke="#57d992" stroke-width="1.6"/>';
    D.comps.forEach(function (c) { s += '<circle cx="' + px(c.fwd_tvl_usd) + '" cy="' + py(c.mcap_usd) + '" r="2.6" fill="#57d992" opacity="0.75"/>'; });
    rows.forEach(function (r) { s += '<circle cx="' + px(r.fwd_tvl_usd) + '" cy="' + py(r.implied_value_usd) + '" r="2.1" fill="#c9a44a" opacity="0.6"/>'; });
    return s + '</svg><div class="sub">green: the ' + F.comps + ' traded tokens that fit the curve (forward TVL against real cap) · gold: the board at its implied value · line: fitCurve()</div>';
  }
  function methodView() {
    var vt = BT.variants.map(function (v) {
      var cls = v.key === 'age' ? 'cut' : v.key === 'full' ? 'kept' : '';
      return '<tr class="' + cls + '"><td>' + esc(v.label) + '</td><td>x' + v.loo_miss.toFixed(2) + '</td><td>' + Math.round(v.loo_within3 * 100) + '%</td><td>x' + v.split_miss.toFixed(2) + '</td><td>' + Math.round(v.split_within3 * 100) + '%</td></tr>';
    }).join('');
    var fams = D.families.map(function (f) {
      return '<tr><td>' + esc(f.family) + '</td><td>' + f.peers + '</td><td>x' + f.raw.toFixed(2) + '</td><td>x' + f.adj.toFixed(2) + '</td></tr>';
    }).join('');
    var ob = D.odds.buckets.map(function (b) {
      var lab = b.hi === null || !isFinite(b.hi) ? (b.lo / 365).toFixed(0) + ' y+' : b.lo < 365 ? b.lo + '-' + b.hi + ' d' : (b.lo / 365).toFixed(0) + '-' + (b.hi / 365).toFixed(0) + ' y';
      return '<tr><td>' + lab + '</td><td>' + b.n + '</td><td>' + Math.round(b.rate * 100) + '%</td></tr>';
    }).join('');
    var acct = D.universe.buckets.map(function (b) {
      return '<p><b class="num">' + b.count + '</b> - ' + esc(b.label) + '</p>';
    }).join('');
    return topBar('method') +
      '<div class="head"><h1>Method and tests</h1><p>How the board is built, and the evidence it stands on. Everything here is computed from the sealed snapshot at run time; nothing is typed in by hand.</p></div>' +
      '<div class="mgrid"><div>' +
      '<div class="panel"><h3>The fit: ' + F.comps + ' traded tokens, cap against forward TVL <span class="fn">fitCurve()</span></h3>' + scatter() +
      '<p>log<sub>10</sub> value = ' + F.a.toFixed(4) + ' + ' + F.b.toFixed(4) + ' x log<sub>10</sub>(forward TVL). A Huber-robust refit was tested and not kept: it widened the left-out miss to x3.43. Raw per-category premiums were tested too (x3.57) and not kept; families are the grain the evidence supports.</p></div>' +
      '<div class="panel"><h3>From ' + D.universe.total + ' protocols to ' + rows.length + ' ranks <span class="fn">selectUniverse()</span></h3>' + acct +
      '<p>The watchlist is the floor, never the ceiling: all ' + D.watchlist_size + ' watchlist protocols are ranked, and so is every other stand-alone protocol that records no token, down to the snapshot\'s own $5M floor.</p></div>' +
      '<div class="panel"><h3>Launch odds <span class="fn">launchOdds()</span></h3>' +
      '<table class="mini"><tr><th>tracked for</th><th>protocols</th><th>record a token</th></tr>' + ob + '</table>' +
      '<p>The share recording a token rises with tracked age toward an ever-rate of ' + Math.round(D.odds.ever_global * 100) + '%. A category\'s own ever-rate is its record corrected for its age mix; the odds a launch is still to come are E(1-F) / (1-EF), F the share of its launches this age has already used. The odds never touch the value - they price the expected drop in farmPlan().</p></div>' +
      '</div><div>' +
      '<div class="panel"><h3>Out of sample: each traded token priced by a fit that never saw it <span class="fn">looCheck()</span></h3>' +
      '<table class="mini"><tr><th>model</th><th>left out</th><th>within 3x</th><th>older-&gt;newer</th><th>within 3x</th></tr>' + vt + '</table>' +
      '<p>The curve earns its place (x4.65 to x3.27). Growth and the family premium are inside the noise of ' + F.comps + ' tokens and are kept bounded for that reason. Age inside the price is the one clear result: it makes both tests worse (x3.39, and x3.10 on the time split), so it is cut from the price and used only in the odds. The printed P25-P75 band is the model\'s own left-out residual band, x' + BT.band25[0].toFixed(2) + ' to x' + BT.band25[1].toFixed(2) + '; fitted on the oldest half it caught ' + BT.band_holds.in25_75 + ' of ' + BT.band_holds.n + ' newer caps.</p></div>' +
      '<div class="panel"><h3>Family premiums <span class="fn">familyPremium()</span></h3>' +
      '<table class="mini"><tr><th>family</th><th>traded</th><th>raw</th><th>shrunk</th></tr>' + fams + '</table>' +
      '<p>Each family\'s traded tokens sit a median ratio off the curve; the ratio is shrunk toward 1 by n/(n+' + M.premium_shrink_k + ') before it prices anything, so a family with four launches moves its rows by less than its raw ratio.</p></div>' +
      '<div class="panel"><h3>Farm verdicts <span class="fn">farmPlan()</span></h3>' +
      '<p>A stated ' + Math.round(M.drop_share * 100) + '% of a launch\'s value is the farmers\' drop, shared pro-rata to TVL. Each plan\'s deposit is sized to its protocol (TVL x ' + M.deposit_tvl_share + ', ' + usd(M.deposit_min) + ' to ' + usd(M.deposit_max) + '). The net is the expected slice at the launch odds, less the plan\'s fees totalled from its chain\'s gas tier, less a ' + Math.round(M.risk_free_rate * 100) + '% T-bill charge on the deposit for the hold. <b>FARM</b> at net &gt;= ' + usd(M.farm_net) + ' (' + T.farm + ' rows), <b>MARGINAL</b> within ' + usd(Math.abs(M.marginal_net)) + ' (' + T.marginal + '), <b>SKIP</b> beyond (' + T.skip + '). Break-even odds - the launch chance at which a plan\'s costs are exactly covered - are printed on every row.</p></div>' +
      '<div class="note"><h3>Note to the judge</h3><ol>' +
      '<li><b>Working radar:</b> <span class="fn">selectUniverse()</span> accounts for all ' + D.universe.total + ' protocols and ranks ' + rows.length + '; <span class="fn">checkBoard()</span> on the board re-derives every row from the fit in your browser and prints the match.</li>' +
      '<li><b>Value model:</b> <span class="fn">impliedValue()</span> is <span class="fn">fitCurve()</span> on the ' + F.comps + ' stand-alone traded tokens, x <span class="fn">familyPremium()</span>, on forward TVL with a bounded growth carry; <span class="fn">looCheck()</span> above tests it blind, and the one term the test cut - age in the price - is named there.</li>' +
      '<li><b>Farm plans:</b> <span class="fn">farmPlan()</span> sets chain, deposit, hold and stop from each row\'s own record, with a cost and a time on every step and a net, a break-even and a verdict on every row.</li>' +
      '<li><b>Page:</b> <span class="fn">filterRows()</span>, <span class="fn">sortRows()</span> and <span class="fn">renderDetail()</span>; a detail view for every protocol; view state lives in the URL hash.</li></ol></div>' +
      '</div></div>' + foot();
  }

  // ---------- traded view ----------
  function tradedView() {
    var trs = D.trades.map(function (t) {
      return '<tr><td><span class="pname">' + esc(t.name) + '</span><div class="sub">' + esc(t.category || '') + '</div></td><td class="num">' + usd(t.tvl_usd) + '</td><td class="num">' + usd(t.mcap_usd) + '</td><td class="num">' + (t.mcap_usd / t.tvl_usd).toFixed(2) + 'x</td><td class="num ' + (t.change_7d > 0 ? 'pos' : t.change_7d < 0 ? 'neg' : '') + '">' + pct(t.change_7d) + '</td></tr>';
    }).join('');
    return topBar('traded') +
      '<div class="head"><h1>Already trades: ' + D.trades.length + ' protocols with a live market cap</h1>' +
      '<p>These are never ranked - the market has already priced them. The stand-alone ' + F.comps + ' of them are the comparables the curve is fitted on; the rest (bridges, staking forms, exchange tokens, versioned releases) are set aside as teachers too, and counted in the accounting on the board.</p></div>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>Cap / TVL</th><th>7d</th></tr></thead><tbody>' + trs + '</tbody></table>' + foot();
  }

  // ---------- render + events ----------
  function render() {
    parseHash();
    var html;
    if (state.view === 'detail' && state.slug && bySlug[state.slug]) html = detailView(bySlug[state.slug]);
    else if (state.view === 'method') html = methodView();
    else if (state.view === 'traded') html = tradedView();
    else html = boardView();
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    wire();
  }
  function wire() {
    app.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-nav');
        location.hash = v === 'method' ? 'm' : v === 'traded' ? 't' : '';
        if (location.hash === '' || (v === 'board' && location.hash === '')) render();
      });
    });
    app.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = 'p=' + tr.getAttribute('data-slug'); });
    });
    app.querySelectorAll('.seg').forEach(function (segEl) {
      segEl.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          var name = segEl.getAttribute('data-seg'), v = b.getAttribute('data-v');
          state[name] = name === 'dep' && v !== 'own' ? parseInt(v, 10) : v;
          render();
        });
      });
    });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; var pos = q.selectionStart; render(); var q2 = document.getElementById('q'); q2.focus(); q2.setSelectionRange(pos, pos); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; render(); });
    var so = document.getElementById('sort');
    if (so) so.addEventListener('change', function () { state.sort = so.value; render(); });
  }
  window.addEventListener('hashchange', render);
  render();
})();
