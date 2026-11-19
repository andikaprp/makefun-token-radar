// Token Launch Radar dashboard. It reads window.RADAR (data.js, written beside dashboard/ by main.ts)
// and renders the ranked board, the filters, a per-protocol detail drawer and the model panel.
// No network: every byte it shows is in data.js, and every number is the model's own - each row
// carries its own peer multiple and factor breakdown from board.json, so the page never recomputes
// a row from one global multiple the way the starter did.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var M = DATA.model;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', set: 'all', tab: 'pre', sort: 'implied', dir: -1, selected: null };
  var MAX_IMPLIED = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(4) + 'x'; }
  function fmtX(n) { return n === null || n === undefined ? 'n/a' : 'x' + n.toFixed(4); }

  // The model's arithmetic, per row: implied = max(1, min(cap, round(TVL x the row's own peer
  // multiple x its growth, age and chain multipliers))). The factors in data.js are the model's
  // own, rounded to 4 decimals, so a recompute lands on the board's number or within a hair of it.
  function impliedOf(r) {
    var raw = Math.round(r.tvl_usd * r.peer_multiple * r.growth_multiplier * r.age_multiplier * r.chain_multiplier);
    return Math.max(1, Math.min(r.cap_usd, raw));
  }

  // Confidence: a multiple is only as strong as the peer set behind it. Fewer than the model's
  // min_peers tokenised peers (or none, the global fallback) is badged wherever the number shows,
  // and since peer-multiple-2 the badge also carries the price of that thinness: the evidence
  // factor the model multiplied the shrunk multiple by before ranking the row.
  function peerBadge(r) {
    if (r.peer_source === 'global') return { cls: 'badge thin', text: 'global median - no category peers' };
    if (r.peer_count < M.min_peers) return { cls: 'badge thin', text: 'thin peer set - ' + r.peer_count + (r.peer_count === 1 ? ' peer' : ' peers') + ', priced x' + r.evidence_factor.toFixed(2) };
    return { cls: 'badge ok', text: r.peer_count + ' peers' };
  }
  function sourceLabel(r) {
    if (r.peer_source === 'category') return 'category median, ' + r.peer_count + ' tokenised peers';
    if (r.peer_source === 'category-shrunk') return 'category median shrunk toward the global median, ' + r.peer_count + ' tokenised peer' + (r.peer_count === 1 ? '' : 's');
    return 'global median - the category has no tokenised peer';
  }
  function thinCount() {
    return DATA.rows.filter(function (r) { return r.peer_source === 'global' || r.peer_count < M.min_peers; }).length;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json (lib/model.ts farmSteps):
  // category, chains, TVL and age decide the action, the capital, the hold and every cost and time.
  // No name is special-cased, and the wording is kept word-for-word with the model's.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('set')) state.set = params.get('set');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.set !== 'all') params.set('set', state.set);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function matches(r, live) {
    var q = state.q.trim().toLowerCase();
    if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
    if (!live) {
      if (state.set === 'watch' && !r.watchlist) return false;
      if (state.set === 'early' && r.watchlist) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
    }
    if (!q) return true;
    var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function rows() { return DATA.rows.filter(function (r) { return matches(r, false); }); }
  function sortVal(r, key) {
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'category') return (r.category || 'Other').toLowerCase();
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
    if (key === 'age') return r.age_days === null ? -1 : r.age_days;
    if (key === 'mult') return r.peer_multiple;
    return r.implied_value_usd;
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av = sortVal(a, key), bv = sortVal(b, key);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN LAUNCH RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of + ' - frozen, no live prices' }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols with no token, ranked by what a launch would be worth' }),
        el('p', { text: 'The watchlist is every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, scored the same way. Each implied value is priced off the snapshot itself: the median market-cap-to-TVL multiple of tokenised protocols in the same category.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Combined implied value' }), el('b', { text: fmtUsd(total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Tokenised peers priced from' }), el('b', { text: String(DATA.peer_protocols) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, all, values, current, apply) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: all }),
        values.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { apply(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    function tabButton(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; render(); } });
    }
    function setButton(set, label) {
      return el('button', { type: 'button', 'aria-pressed': state.set === set ? 'true' : 'false', text: label, onclick: function () { state.set = set; writeHash(); render(); } });
    }
    var kids = [
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', 'All categories', categories, state.category, function (v) { state.category = v; }),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Board' }), el('div', { class: 'tabs' }, tabButton('pre', 'Pre-token'), tabButton('live', 'Live token')))
    ];
    if (state.tab === 'pre') {
      kids.push(select('chain', 'Chain', 'All chains', chains, state.chain, function (v) { state.chain = v; }));
      kids.push(el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Set' }), el('div', { class: 'tabs' }, setButton('all', 'All rows'), setButton('watch', 'Watchlist'), setButton('early', 'Early radar'))));
    }
    kids.push(el('span', { class: 'count', text: state.tab === 'pre' ? rows().length + ' of ' + DATA.rows.length + ' rows shown' : DATA.live.filter(function (r) { return matches(r, true); }).length + ' live-token protocols' }));
    return el('div', { class: 'controls' }, kids);
  }

  function sortHeader(key, label) {
    var active = state.sort === key;
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () {
        if (active) state.dir = -state.dir;
        else { state.sort = key; state.dir = (key === 'name' || key === 'category') ? 1 : -1; }
        render();
      } }, label, active ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null)
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or set to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.set = 'all'; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var badge = peerBadge(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'unnamed' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'mult' },
          el('span', { class: 'num', text: fmtMult(r.peer_multiple) }),
          el('span', { class: badge.cls, text: badge.text })
        )),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / MAX_IMPLIED) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'chip ' + (r.watchlist ? 'watch' : 'early'), text: r.watchlist ? 'Watchlist' : 'Early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', null,
      el('p', { class: 'legend', text: 'Peer evidence: a multiple badged "thin peer set" rests on fewer than ' + M.min_peers + ' tokenised peers in its category. It is shrunk toward the snapshot-wide median and then discounted - priced at x0.70 of the shrunk multiple for one peer, x0.80 for two, x0.90 for three - because a category priced off one launch is a claim, not a market price. "Global median" means the category has no tokenised peer at all. ' + thinCount() + ' of ' + DATA.rows.length + ' rows carry a thin badge. Select any row for its full factor breakdown and farm plan.' }),
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Bars are scaled to the board leader.' }),
            el('thead', null, el('tr', null,
              sortHeader('implied', 'Rank'),
              sortHeader('name', 'Protocol'),
              sortHeader('category', 'Category'),
              el('th', { scope: 'col', text: 'Chains' }),
              sortHeader('tvl', 'TVL'),
              sortHeader('growth', '7d'),
              sortHeader('age', 'Age'),
              sortHeader('mult', 'Peer multiple'),
              sortHeader('implied', 'Implied value'),
              el('th', { scope: 'col', text: 'Set' })
            )),
            tbody
          )
        )
      )
    );
  }

  function liveTable() {
    var list = DATA.live.filter(function (r) { return matches(r, true); });
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'chip early', text: 'Live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? fmtMult(r.mcap_usd / r.tvl_usd) : 'n/a' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Already trading: these protocols have a token, so their market cap is a fact, not a model. They are the peer set the pre-token multiples are priced from, and they are never mixed into the ranking. Top ' + DATA.live_size + ' by market cap.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed - ' + DATA.model_version }),
      el('p', { class: 'sub', text: 'One function of the snapshot figures scores every row. No protocol name is special-cased, no row is hand-picked, and already-trading tokens are never ranked - they are the peers the multiples are priced from.' }),
      el('div', { class: 'formula' },
        'implied = min(cap, round( TVL x peer_multiple x growth x age x chains ))',
        el('br'), el('span', { class: 'dim', text: 'peer_multiple = median mcap/TVL of the category\'s tokenised protocols, each ratio clamped to [' + M.ratio_floor + ', ' + M.ratio_cap + '], shrunk toward the snapshot-wide median with weight peers/(peers + ' + M.shrink_k + '); a category with no peers uses the global median outright' }),
        el('br'), el('span', { class: 'dim', text: 'evidence = while a category has fewer than ' + M.min_peers + ' peers, its shrunk multiple is multiplied by 1 - ' + M.thin_discount_max + ' x (1 - peers/' + M.min_peers + '): x0.70 for one peer, x0.80 for two, x0.90 for three. One launch is not a market price, so thin evidence is priced at a discount, not just badged' }),
        el('br'), el('span', { class: 'dim', text: 'growth = 1 + clamp(change_7d, ' + M.growth_floor + '%, +' + M.growth_cap + '%)/100 x ' + M.growth_weight + '  ·  age = ' + M.age_floor + ' + min(age_days, ' + M.age_days_cap + ')/' + M.age_days_cap + ' x ' + M.age_range + ' (unknown age counts as ' + M.unknown_age_days + ' days)  ·  chains = 1 + ' + M.chain_step + ' x min(extra chains, ' + M.chain_max_extra + ')' }),
        el('br'), el('span', { class: 'dim', text: 'cap = ' + M.cap_factor + ' x the largest tokenised peer market cap in the category (the snapshot-wide largest when the category has fewer than ' + M.min_peers + ' peers) - a sanity guard, not a ranking tool' })
      ),
      el('p', { class: 'sub', text: 'Peer set: ' + DATA.peer_protocols + ' tokenised protocols (exchanges excluded). Snapshot-wide median multiple ' + fmtMult(DATA.peer_global_median) + '. Open any row to see its own multiple, the medians it was blended from, and whether the cap bound.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function eqRow(label, value) { return el('div', null, el('span', { text: label }), el('b', { class: 'num', text: value })); }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var badge = peerBadge(row);
    var recomputed = impliedOf(row);
    var delta = row.implied_value_usd ? Math.abs(recomputed - row.implied_value_usd) / row.implied_value_usd : 0;
    var checkText = recomputed === row.implied_value_usd
      ? 'This page recomputes the row from its own stored factors and lands exactly on the board\'s number.'
      : 'This page recomputes the row from its own stored factors as ' + fmtUsd(recomputed) + ' - within ' + (delta * 100).toFixed(3) + '% of the board\'s number; the stored factors are rounded to 4 decimals, the model\'s were not.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.listed_at ? ' - first listed ' + row.listed_at : ' - listing date unknown') }),
        el('div', { class: 'detail-chips' },
          el('span', { class: 'chip ' + (row.watchlist ? 'watch' : 'early'), text: row.watchlist ? 'Watchlist - at or above the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor' : 'Early radar - below the floor' }),
          el('span', { class: 'chip early', text: 'No token on record' }),
          row.capped ? el('span', { class: 'chip capped', text: 'Sanity cap bound' }) : null
        )
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value, factor by factor' }),
      el('div', { class: 'equation' },
        eqRow('TVL (snapshot)', fmtUsd(row.tvl_usd)),
        eqRow('Peer multiple - ' + sourceLabel(row), fmtMult(row.peer_multiple)),
        eqRow('Category median multiple', row.category_median_multiple === null ? 'no tokenised peers' : fmtMult(row.category_median_multiple)),
        eqRow('Global median multiple', fmtMult(row.global_median_multiple)),
        eqRow('Multiple after shrinkage', fmtMult(row.shrunk_multiple)),
        eqRow('Evidence factor - ' + (row.peer_count >= M.min_peers ? 'peer set at the ' + M.min_peers + '-peer minimum or better' : 'thin peer set, ' + row.peer_count + (row.peer_count === 1 ? ' peer' : ' peers')), fmtX(row.evidence_factor)),
        eqRow('Base value (TVL x peer multiple)', fmtUsd(row.base_value_usd)),
        eqRow('7d growth ' + fmtPct(row.change_7d) + ', clamped to ' + fmtPct(row.growth_pct), fmtX(row.growth_multiplier)),
        eqRow('Age with no token ' + fmtAge(row.age_days), fmtX(row.age_multiplier)),
        eqRow('Chain breadth, ' + row.chains.length + (row.chains.length === 1 ? ' chain' : ' chains'), fmtX(row.chain_multiplier)),
        eqRow('Sanity cap', fmtUsd(row.cap_usd) + (row.capped ? ' - bound' : ' - not bound')),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub check', text: checkText + ' An estimate from the snapshot\'s own figures, not a price and not a promise a token will exist.' }),
      el('p', { class: 'sub check' }, el('span', { class: badge.cls, text: badge.text }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, farmSteps(row).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    if (state.tab === 'pre') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'foot', text: 'Implied value is this model\'s claim about a hypothetical launch, derived only from the frozen ' + DATA.as_of + ' snapshot. It does not predict whether or when a token issues. Farm plans are generic templates from category, chains, TVL and age - check a protocol\'s own pages before acting on one.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
