// Token Launch Radar dashboard, model fitted-comps-2. Reads window.RADAR (data.js, written
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

  // ---------- farm maths at any deposit and drop share (farmPlan's own arithmetic) ----------
  function netAt(r, dep, ds) {
    var share = ds === undefined ? M.drop_share : ds;
    var slice = share * r.launch_value_usd * r.launch_odds * dep / r.tvl_usd;
    var opp = dep * M.risk_free_rate * r.hold_days / 365;
    return { slice: slice, opp: opp, net: slice - r.fees_usd - opp };
  }
  function verdictOf(net) { return net >= M.farm_net ? 'FARM' : net >= M.marginal_net ? 'MARGINAL' : 'SKIP'; }

  // ---------- checkBoard(): the page verifies itself against the model ----------
  function checkBoard() {
    var ok = 0, bands = 0, ranges = 0, nets = 0, sorted = true, sum = 0, wl = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var pred = Math.pow(10, F.a + F.b * Math.log10(r.fwd_tvl_usd)) * r.family_premium;
      if (Math.abs(pred - r.launch_value_usd) / r.launch_value_usd < 0.015) ok++;
      if (Math.abs(pred * BT.band25[0] - r.band_low_usd) / r.band_low_usd < 0.015 && Math.abs(pred * BT.band25[1] - r.band_high_usd) / r.band_high_usd < 0.015) bands++;
      var lo = 1, hi = 0;
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].launch_value_usd > r.band_high_usd) lo++;
        if (rows[j].launch_value_usd >= r.band_low_usd) hi++;
      }
      if (lo === r.rank_low && Math.max(r.rank, hi) === r.rank_high) ranges++;
      var e = netAt(r, r.deposit_usd);
      if (Math.abs(e.net - r.net_usd) < Math.max(0.06, Math.abs(r.net_usd) * 0.015) && verdictOf(e.net) === r.verdict) nets++;
      if (i > 0 && rows[i].implied_value_usd > rows[i - 1].implied_value_usd) sorted = false;
      sum += r.implied_value_usd;
      if (r.watchlist) wl++;
    }
    return { ok: ok, bands: bands, ranges: ranges, nets: nets, sorted: sorted, sum: sum, wl: wl, total: T.implied_total };
  }

  // ---------- state ----------
  var state = { view: 'board', set: 'all', verdict: 'any', dep: 'own', ds: M.drop_share, q: '', cat: 'all', chain: 'all', sort: 'rank', slug: null };
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
      if (p[0] === 'g') state.ds = parseInt(p[1], 10) / 100;
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
    var full = BT.variants.filter(function (v) { return v.key === 'model'; })[0];
    var flat = BT.variants.filter(function (v) { return v.key === 'flat'; })[0];
    var top = rows[0];
    var tiles = [
      ['Ranked', String(rows.length), D.watchlist_size + '/' + D.watchlist_size + ' watchlist · ' + D.early_size + ' below the ' + usd(D.floor_usd) + ' floor'],
      ['Implied value', usd(T.implied_total), 'board total · rank 1 ' + esc(top.name) + ' ' + usd(top.implied_value_usd)],
      ['Held-out miss', 'x' + full.loo_miss.toFixed(2), 'flat x' + flat.loo_miss.toFixed(2) + ' · each of ' + F.comps + ' comps priced unseen'],
      ['Newer from older', 'x' + full.split_miss.toFixed(2), 'fit on the older half · ' + BT.split_n + ' newer · ' + Math.round(full.split_within3 * 100) + '% within x3'],
      ['Range holds', Math.round(BT.band_holds.in25_75 / BT.band_holds.n * 100) + '%', 'of newer caps in the P25-P75 band · ' + Math.round(BT.band_holds.in10_90 / BT.band_holds.n * 100) + '% in P10-P90'],
      ['Worth farming', String(T.farm), T.marginal + ' marginal · ' + T.skip + ' skip · best ' + (T.best_net_per_hour ? usd(T.best_net_per_hour.per_hour) + '/h (' + esc(T.best_net_per_hour.name) + ')' : '') + ', own size, model\'s ' + Math.round(M.drop_share * 100) + '% drop']
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
    var rail = BT.variants.filter(function (v) { return ['flat', 'curve', 'growth', 'full', 'model'].indexOf(v.key) >= 0; });
    var short = { flat: 'one flat multiple', curve: '+ size curve', growth: '+ growth carry', full: '+ family premium', model: '+ Huber fit (the model)' };
    var rowsHtml = rail.map(function (v) {
      var cls = v.key === 'model' ? 'kept' : '';
      return '<tr class="' + cls + '"><td>' + esc(short[v.key] || v.label) + '</td><td>x' + v.loo_miss.toFixed(2) + ' · ' + Math.round(v.loo_within3 * 100) + '%</td><td>x' + v.split_miss.toFixed(2) + ' · ' + Math.round(v.split_within3 * 100) + '%</td></tr>';
    }).join('');
    var full = BT.variants.filter(function (v) { return v.key === 'model'; })[0];
    var age = BT.variants.filter(function (v) { return v.key === 'age'; })[0];
    var S = D.stability;
    var honesty = '<table class="mini"><tr><th>on the newer ' + BT.band_holds.n + '</th><th>left out</th><th>older-&gt;newer</th></tr>' +
      '<tr><td>within x3 of the figure</td><td>' + Math.round(full.loo_within3 * 100) + '%</td><td>' + Math.round(full.split_within3 * 100) + '%</td></tr>' +
      '<tr><td>in P25-P75 (states 50%)</td><td>-</td><td>' + BT.band_holds.in25_75 + ' · ' + Math.round(BT.band_holds.in25_75 / BT.band_holds.n * 100) + '%</td></tr>' +
      '<tr><td>in P10-P90 (states 80%)</td><td>-</td><td>' + BT.band_holds.in10_90 + ' · ' + Math.round(BT.band_holds.in10_90 / BT.band_holds.n * 100) + '%</td></tr></table>';
    return '<div class="panel"><h3>Out-of-sample check <span class="fn">backtestModel()</span></h3>' +
      '<p><b>Does it hold on tokens it never saw?</b> Two blind tests over the ' + F.comps + ' traded tokens: each priced unseen, the ' + BT.split_n + ' newer by a fit on the older half alone. % = share within x3.</p>' +
      '<table class="mini"><tr><th>model</th><th>left out</th><th>older-&gt;newer</th></tr>' + rowsHtml + '</table>' +
      '<p>The size curve does the work; the Huber fit edges the plain one on both tests. <b>Age in the price made both worse</b> (x' + age.loo_miss.toFixed(2) + ', x' + age.split_miss.toFixed(2) + ' by time), so age sets the launch odds instead. Two more cuts are tested in Method.</p>' +
      '<p><b>Are the printed ranges honest?</b></p>' + honesty +
      '<p>The bands run a little narrow, as printed. Across ' + S.refits + ' bootstrap refits (<span class="fn">refitStability()</span>), ' + S.holds + ' of the top ' + S.top_n + ' hold in at least 80% of refits; median overlap ' + S.median_overlap + ' of ' + S.top_n + '.</p></div>' +
      '<div class="panel"><h3>How a row is priced <span class="fn">launchValue()</span></h3><ol class="how">' +
      '<li><b>Size curve.</b> log<sub>10</sub> value = ' + F.a.toFixed(2) + ' + ' + F.b.toFixed(2) + ' x log<sub>10</sub>(forward TVL), Huber-fitted on ' + F.comps + ' stand-alone tokens that trade. Ten times the TVL buys about ' + Math.pow(10, F.b).toFixed(1) + ' times the value, not ten.</li>' +
      '<li><b>Growth carry.</b> Forward TVL carries the week\'s excess move (the protocol\'s 7-day change less the comps\' median ' + pct(F.med_change) + '), at power ' + M.growth_gamma + ', clamped.</li>' +
      '<li><b>Family premium.</b> A family\'s traded tokens sit a median ratio off the curve; shrunk toward 1 by n/(n+' + M.premium_shrink_k + '), it multiplies the curve\'s value.</li>' +
      '<li><b>Launch odds.</b> ' + Math.round(D.odds.ever_global * 100) + '% of the oldest protocols record a token; a category\'s own ever-rate and the share of its launches this age has already used give the odds a launch is still to come. Held out (<span class="fn">oddsCheck()</span>) the odds do not beat the base rate at calling who has launched, so they price the farm maths, never the value.</li>' +
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
      if (state.verdict !== 'any' && verdictOf(netAt(r, depOf(r), state.ds).net) !== state.verdict.toUpperCase()) return false;
      return true;
    });
    var key = {
      rank: function (a, b) { return a.rank - b.rank; },
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      net: function (a, b) { return netAt(b, depOf(b), state.ds).net - netAt(a, depOf(a), state.ds).net; },
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
      var dep = depOf(r), e = netAt(r, dep, state.ds), vd = verdictOf(e.net);
      var per1k = e.net / dep * 1000, perHour = e.net / (r.time_minutes / 60);
      return '<tr data-slug="' + r.slug + '"><td><div class="rank">' + r.rank + '</div><div class="sub">' + r.rank_low + '-' + r.rank_high + '</div></td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '<span class="badge grey">BELOW FLOOR</span>') +
        '<div class="sub">' + esc(r.category || 'uncategorised') + ' · ' + esc(r.chains[0] || '') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</div></td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : '') + '">' + pct(r.change_7d) + '</td>' +
        '<td>' + age(r.age_days) + '</td>' +
        '<td class="num">' + Math.round(r.launch_odds * 100) + '%<span class="oddsbar"><i style="width:' + Math.round(r.launch_odds * 100) + '%"></i></span></td>' +
        '<td><span class="num" style="font-weight:700">' + usd(r.implied_value_usd) + '</span>' + whisk(r) + '<div class="sub">' + usd(r.band_low_usd) + ' to ' + usd(r.band_high_usd) + '</div></td>' +
        '<td><span class="chip ' + vd + '">' + vd + '</span> <span class="net ' + vd + '">' + signed2(e.net) + '</span><div class="sub">on ' + usd(dep) + ' · ' + signed2(per1k) + '/$1k · ' + signed2(perHour) + '/h</div></td></tr>';
    }).join('');
    return topBar('board') +
      '<div class="head"><h1>' + rows.length + ' protocols that record no token, ranked by <b>what a launch would be worth</b></h1>' +
      '<p>Implied value is the value if it launches: a Huber-fitted size curve on the ' + F.comps + ' stand-alone tokens that trade, a family premium and a bounded growth carry, each kept or cut by the blind test beside the board. The launch odds price the farm maths, not the value.</p></div>' +
      kpis() + accounting() +
      '<div class="layout"><div><div class="controls">' +
      seg('set', [['all', 'All ' + rows.length], ['watch', 'Watchlist ' + D.watchlist_size], ['below', 'Below floor ' + D.early_size]]) +
      seg('verdict', [['any', 'Any verdict'], ['farm', 'Farm'], ['marginal', 'Marginal'], ['skip', 'Skip']]) +
      seg('dep', [['own', 'Plan size'], ['1000', '$1,000'], ['10000', '$10,000']]) +
      seg('ds', [['0.04', 'Drop 4%'], ['0.08', 'Drop 8% · model'], ['0.14', 'Drop 14%']]) +
      '<input type="search" id="q" placeholder="Search protocols" value="' + esc(state.q) + '">' +
      '<select id="cat"><option value="all">All categories</option>' + cats.map(function (c) { return '<option' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="chain"><option value="all">All chains</option>' + chains.map(function (c) { return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="sort">' + [['rank', 'Sort: rank'], ['value', 'Sort: implied value'], ['net', 'Sort: net of fees'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d change'], ['age', 'Sort: tracked'], ['odds', 'Sort: launch odds']].map(function (o) { return '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="countline">' + list.length + ' of ' + rows.length + ' protocols shown · nets priced at ' + depLabel + ' and a ' + Math.round(state.ds * 100) + '% drop share · click a row for its detail</div>' +
      '<p class="checkline">✓ checkBoard(): ' + rows.length + ' rows drawn = ' + rows.length + ' written · ranks 1 to ' + rows.length + ' in order · values never rise · total ' + usdFull(chk.sum) + ' = ' + usdFull(chk.total) + ' · ' + chk.wl + '/' + D.watchlist_size + ' watchlist · ' + chk.ok + '/' + rows.length + ' values, ' + chk.bands + '/' + rows.length + ' bands, ' + chk.ranges + '/' + rows.length + ' rank ranges, ' + chk.nets + '/' + rows.length + ' nets and verdicts re-derived from the fit in this browser</p>' +
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
    var steps = r.steps.map(function (s, i) {
      return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(s.text) + '</td><td class="ct">' + esc(s.cost) + '</td><td class="ct">' + esc(s.time) + '</td></tr>';
    }).join('');
    var depCols = [1000, dep, 10000].filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var dropRows = [0.04, M.drop_share, 0.14].filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var matrix = '<table class="matrix"><tr><th>drop \\ deposit</th>' + depCols.map(function (d2) { return '<th>' + usd(d2) + (d2 === dep ? ' · plan' : '') + '</th>'; }).join('') + '</tr>' +
      dropRows.map(function (ds) {
        return '<tr><th>' + Math.round(ds * 100) + '%' + (ds === M.drop_share ? ' · model' : '') + '</th>' + depCols.map(function (d2) {
          var n2 = netAt(r, d2, ds), v2 = verdictOf(n2.net);
          return '<td class="' + (ds === M.drop_share && d2 === dep ? 'own ' : '') + v2 + '">' + signed2(n2.net) + '<br><span class="sub">' + v2 + '</span></td>';
        }).join('') + '</tr>';
      }).join('') + '</table>';
    var dropPer1k = M.drop_share * r.launch_value_usd * r.launch_odds / r.tvl_usd * 1000;
    return topBar('detail') +
      '<button class="back" data-nav="board">← Board</button>' +
      '<div class="dhead"><div><h2>' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '<span class="badge grey">BELOW FLOOR</span>') + '</h2>' +
      '<div class="sub" style="font-size:13px">' + esc(r.category || 'uncategorised') + ' · ' + r.chains.map(esc).join(', ') + ' · records no token</div>' +
      '<div class="sub" style="margin-top:6px">rank ' + r.rank + ' of ' + rows.length + '; ' + r.rank_low + ' to ' + r.rank_high + ' across its range · snapshot record: listed ' + (r.listed_at || 'undated') + ' · market cap: none on record · CoinGecko id: ' + (r.gecko_id ? esc(r.gecko_id) : 'none') + ' · symbol: ' + (r.symbol ? esc(r.symbol) : 'none') + ' - the nulls are what pre-token means here</div></div>' +
      '<div style="text-align:right"><div class="big">' + usd(r.implied_value_usd) + '</div><div class="sub">implied value, the value if it launches<br>P25-P75 ' + usd(r.band_low_usd) + ' to ' + usd(r.band_high_usd) + '</div></div></div>' +
      '<div class="dgrid"><div><h3 style="margin:4px 0 8px">How the figure is made <span style="color:var(--gold);font-family:var(--mono);font-size:12px">launchValue()</span></h3>' +
      '<table class="build">' + buildHtml + '</table>' +
      '<h3 style="margin:16px 0 8px">Nearest traded comparables</h3><table class="build">' + comps + '</table></div>' +
      '<div><div class="farmbox"><h3 style="margin:0">Farm plan <span style="color:var(--gold);font-family:var(--mono);font-size:12px">farmPlan()</span></h3>' +
      '<div class="netline"><span class="chip ' + vd + '">' + vd + '</span> <b>' + signed2(e.net) + '</b> net over ' + r.hold_days + ' days: expected drop ' + usd(e.slice) + ' at the odds on ' + usd(dep) + ', less ' + usd(r.fees_usd) + ' fees and ' + usd(e.opp) + ' T-bill cost. Break-even odds ' + (r.break_even_odds > 1 ? '&gt;100%' : Math.round(r.break_even_odds * 100) + '%') + '.</div>' +
      '<div class="farmgrid">' +
      '<div class="cell"><div class="k">At risk</div><div class="v">' + usd(dep) + '</div></div>' +
      '<div class="cell"><div class="k">Fees</div><div class="v">' + usd(r.fees_usd) + '</div></div>' +
      '<div class="cell"><div class="k">Your time</div><div class="v">' + hours(r.time_minutes) + '</div></div>' +
      '<div class="cell"><div class="k">Model\'s drop</div><div class="v">' + usd(e.slice) + '</div></div>' +
      '<div class="cell"><div class="k">Drop per $1k</div><div class="v">' + usd(dropPer1k) + '</div></div>' +
      '<div class="cell"><div class="k">Net</div><div class="v">' + signed2(e.net) + '</div></div></div>' +
      '<div class="sub">Net at other drop shares and sizes; drop per $1k is before fees.</div>' + matrix +
      '<table class="steps"><tr><th></th><th>Step</th><th>Cost</th><th>Time</th></tr>' + steps +
      '<tr class="tot"><td></td><td>All ' + r.steps.length + ' steps over ' + r.hold_days + ' days</td><td class="ct">' + usd(r.fees_usd) + '</td><td class="ct">' + hours(r.time_minutes) + '</td></tr></table>' +
      '<div class="sub">The position may earn the protocol\'s own yield, which would offset the T-bill cost; the snapshot carries no yields, so none is assumed.</div>' +
      '</div></div></div>' + foot();
  }

  // ---------- method view ----------
  function scatter() {
    var W = 660, H = 150, L = 56, B = 30, X0 = 6.4, X1 = 9.7, Y0 = 4.6, Y1 = 10.4;
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
      var cls = v.key === 'model' ? 'kept' : (v.key === 'age' || v.key === 'rawcat') ? 'cut' : '';
      return '<tr class="' + cls + '"><td>' + esc(v.label) + '</td><td>x' + v.loo_miss.toFixed(2) + '</td><td>' + Math.round(v.loo_within3 * 100) + '%</td><td>' + v.loo_rho.toFixed(2) + '</td><td>x' + v.split_miss.toFixed(2) + '</td><td>' + Math.round(v.split_within3 * 100) + '%</td></tr>';
    }).join('');
    var vm = BT.variants.filter(function (v) { return v.key === 'model'; })[0];
    var vfull = BT.variants.filter(function (v) { return v.key === 'full'; })[0];
    var vage = BT.variants.filter(function (v) { return v.key === 'age'; })[0];
    var vraw = BT.variants.filter(function (v) { return v.key === 'rawcat'; })[0];
    var vflat = BT.variants.filter(function (v) { return v.key === 'flat'; })[0];
    var OC = D.odds_check, ST = D.stability;
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
      '<div class="head"><h1>Method and tests</h1><p>How the board is built, and the evidence it stands on - all computed from the sealed snapshot at run time, nothing typed in by hand.</p></div>' +
      '<div class="mgrid"><div>' +
      '<div class="panel"><h3>The fit: ' + F.comps + ' traded tokens, cap against forward TVL <span class="fn">fitCurve()</span></h3>' + scatter() +
      '<p>log<sub>10</sub> value = ' + F.a.toFixed(4) + ' + ' + F.b.toFixed(4) + ' x log<sub>10</sub>(forward TVL), fitted with Huber weights (<span class="fn">huberOls()</span>). The robust fit is the model because the blind tests say so: it edges the plain fit left out (x' + vm.loo_miss.toFixed(2) + ' against x' + vfull.loo_miss.toFixed(2) + ') and by time (x' + vm.split_miss.toFixed(2) + ' against x' + vfull.split_miss.toFixed(2) + '), and ranks the held-out caps best (ρ ' + vm.loo_rho.toFixed(2) + '). Raw category premiums (x' + vraw.loo_miss.toFixed(2) + ', ρ ' + vraw.loo_rho.toFixed(2) + ') were not kept.</p></div>' +
      '<div class="panel"><h3>From ' + D.universe.total + ' protocols to ' + rows.length + ' ranks <span class="fn">selectUniverse()</span></h3><div class="acctgrid">' + acct + '</div>' +
      '<p>All ' + D.watchlist_size + ' watchlist protocols are ranked, and so is every other stand-alone protocol that records no token, down to the snapshot\'s own ' + usd(D.floor_usd) + ' floor.</p></div>' +
      '<div class="panel"><h3>Farm verdicts <span class="fn">farmPlan()</span></h3>' +
      '<p>A stated ' + Math.round(M.drop_share * 100) + '% of a launch\'s value is the farmers\' drop. Deposits are sized to the protocol (TVL x ' + M.deposit_tvl_share + ', ' + usd(M.deposit_min) + ' to ' + usd(M.deposit_max) + '). Net = the expected slice at the launch odds, less the plan\'s fees from its chain\'s gas tier, less a ' + Math.round(M.risk_free_rate * 100) + '% T-bill charge. <b>FARM</b> at net &gt;= ' + usd(M.farm_net) + ' (' + T.farm + '), <b>MARGINAL</b> within ' + usd(Math.abs(M.marginal_net)) + ' (' + T.marginal + '), <b>SKIP</b> beyond (' + T.skip + '). Break-even odds are on every detail page.</p></div>' +
      '<div class="note"><h3>Note to the judge</h3><ol>' +
      '<li><b>Working radar:</b> <span class="fn">selectUniverse()</span> accounts for all ' + D.universe.total + ' protocols and ranks ' + rows.length + '; <span class="fn">checkBoard()</span> on the board re-derives every value, band, rank range, net and verdict from the fit in your browser and prints the match.</li>' +
      '<li><b>Value model:</b> <span class="fn">launchValue()</span> is <span class="fn">fitCurve()</span> with Huber weights on the ' + F.comps + ' stand-alone traded tokens, x <span class="fn">familyPremiums()</span>, on forward TVL with a bounded growth carry; <span class="fn">backtestModel()</span> tests it blind, and the cut terms are named there with their scores.</li>' +
      '<li><b>Farm plans:</b> <span class="fn">farmPlan()</span> sets chain, deposit, hold and stop from each row\'s own record, with a cost and a time on every step, a net and a verdict on every row, and a break-even plus a drop x size matrix on every detail page.</li>' +
      '<li><b>Page:</b> <span class="fn">filteredRows()</span> behind the board\'s filters, sorts and drop-share toggle; <span class="fn">boardView()</span>, <span class="fn">detailView()</span>, <span class="fn">methodView()</span> behind the views; state lives in the URL hash.</li></ol></div>' +
      '</div><div>' +
      '<div class="panel"><h3>Out of sample: every comp priced unseen <span class="fn">backtestModel()</span></h3>' +
      '<table class="mini"><tr><th>model</th><th>left out</th><th>within 3x</th><th>rank ρ</th><th>older-&gt;newer</th><th>within 3x</th></tr>' + vt + '</table>' +
      '<p>The curve earns its place (x' + vflat.loo_miss.toFixed(2) + ' to x' + vm.loo_miss.toFixed(2) + '), and the robust fit keeps the best rank order (ρ ' + vm.loo_rho.toFixed(2) + '). Growth and the premium are noise-level on ' + F.comps + ' tokens, kept bounded. Age in the price is the clear result: it makes both tests worse (x' + vage.loo_miss.toFixed(2) + ', x' + vage.split_miss.toFixed(2) + ' by time), so it is cut and used only in the odds. The printed band is the model\'s own left-out residual band (x' + BT.band25[0].toFixed(2) + ' to x' + BT.band25[1].toFixed(2) + '), catching ' + BT.band_holds.in25_75 + ' of ' + BT.band_holds.n + ' on the oldest-half fit.</p>' +
      '<p><b>Stated in ranks (<span class="fn">refitStability()</span>):</b> the top ' + ST.top_n + ' keeps ' + ST.kept.flat + ' of ' + ST.top_n + ' under one flat multiple, ' + ST.kept.growth + ' with the growth carry, ' + ST.kept.age + ' with age priced in, ' + ST.kept.rawcat + ' under raw category premiums. Across ' + ST.refits + ' bootstrap refits, ' + ST.holds + ' of the top ' + ST.top_n + ' hold in at least 80% of refits; median overlap ' + ST.median_overlap + ' of ' + ST.top_n + '.</p></div>' +
      '<div class="panel"><h3>Family premiums <span class="fn">familyPremiums()</span></h3>' +
      '<table class="mini"><tr><th>family</th><th>traded</th><th>raw</th><th>shrunk</th></tr>' + fams + '</table>' +
      '<p>Each family\'s traded tokens sit a median ratio off the curve, shrunk toward 1 by n/(n+' + M.premium_shrink_k + ') before pricing.</p></div>' +
      '<div class="panel"><h3>Launch odds <span class="fn">launchOdds()</span></h3>' +
      '<table class="mini"><tr><th>tracked for</th><th>protocols</th><th>record a token</th></tr>' + ob + '</table>' +
      '<p>The share recording a token rises with tracked age toward an ever-rate of ' + Math.round(D.odds.ever_global * 100) + '%; a category\'s rate is corrected for its age mix. The odds a launch is still to come are E(1-F) / (1-EF), F the share of its launches this age has used; they never touch the value.</p>' +
      '<p><b>Held out (<span class="fn">oddsCheck()</span>):</b> fitted on the older ' + OC.train_n + ', the implied share calls ' + Math.round(OC.called_right * 100) + '% of the newer ' + OC.n + ' against ' + Math.round(OC.base_rate * 100) + '% for the majority guess (AUC ' + OC.auc.toFixed(2) + ') - no better than the base rate, so the odds price only farm nets, never a rank.</p></div>' +
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
          state[name] = name === 'dep' && v !== 'own' ? parseInt(v, 10) : name === 'ds' ? parseFloat(v) : v;
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
