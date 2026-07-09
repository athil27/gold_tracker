/* ============================================================================
   GOLD PRICE TRACKER — Phase 1
   Static, client-only, localStorage-persisted. No backend.
   ============================================================================ */

const GRAMS_PER_OZ = 31.1034768;
const SCHEMA_VERSION = 3;
const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Karat is numeric everywhere (spec §7.1) — one purity lookup instead of
 *  per-karat branching scattered across price/portfolio/alert code. */
const PURITY_FACTOR = { 18: 0.750, 21: 0.875, 22: 0.9167, 24: 0.999 };
const KARATS = [18, 21, 22, 24];

function purityRatio(karat) {
  return PURITY_FACTOR[Number(karat)] ?? PURITY_FACTOR[22];
}

/* ----------------------------------------------------------------------------
   STORE — minimal pub/sub so a data mutation (add/edit/delete purchase, goal,
   or alert) notifies every dependent render function once, in one place,
   instead of each mutation site manually remembering which renders to call.
   First application of the Repository/Store layering from the redesign spec.
---------------------------------------------------------------------------- */

const Store = (() => {
  const listeners = {};
  return {
    on(event, fn) {
      (listeners[event] || (listeners[event] = [])).push(fn);
    },
    emit(event) {
      (listeners[event] || []).forEach(fn => fn());
    }
  };
})();

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'SAR', symbol: 'SAR ', name: 'Saudi Riyal' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'AED', symbol: 'AED ', name: 'UAE Dirham' },
  { code: 'KWD', symbol: 'KWD ', name: 'Kuwaiti Dinar' },
  { code: 'QAR', symbol: 'QAR ', name: 'Qatari Riyal' },
  { code: 'BHD', symbol: 'BHD ', name: 'Bahraini Dinar' },
  { code: 'OMR', symbol: 'OMR ', name: 'Omani Rial' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' }
];

function currencyMeta(code) {
  return CURRENCIES.find(c => c.code === code) || { code, symbol: code + ' ', name: code };
}

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function money(code, n) {
  return currencyMeta(code).symbol + fmt(n);
}

/* ----------------------------------------------------------------------------
   MIGRATION
   v1 -> v2: purchases gain id/notes; single goal -> goals array; alerts seeded.
   v2 -> v3: karat becomes numeric everywhere (was string '22'/'24'); karat
             range extends to 18/21/22/24; selected-karats display setting added.
---------------------------------------------------------------------------- */

function runMigration() {
  const currentVersion = parseInt(localStorage.getItem('goldtracker_schema_version') || '1', 10);
  if (currentVersion >= SCHEMA_VERSION) return;

  // --- purchases: add id + notes ---
  if (!localStorage.getItem('goldtracker_purchases_v2')) {
    const oldPurchases = JSON.parse(localStorage.getItem('goldtracker_purchases') || '[]');
    const migrated = oldPurchases.map(p => ({
      id: uid(),
      date: p.date,
      karat: String(p.karat),
      grams: parseFloat(p.grams) || 0,
      price: parseFloat(p.price) || 0,
      currency: p.currency || 'INR',
      jeweller: p.jeweller || '',
      notes: p.notes || ''
    }));
    localStorage.setItem('goldtracker_purchases_v2', JSON.stringify(migrated));
  }

  // --- goals: single goal -> goals array ---
  if (!localStorage.getItem('goldtracker_goals_v2')) {
    const oldGoal = JSON.parse(localStorage.getItem('goldtracker_goal') || 'null');
    const goals = [];
    if (oldGoal && oldGoal.grams) {
      goals.push({
        id: uid(),
        name: oldGoal.name || 'Gold goal',
        targetGrams: parseFloat(oldGoal.grams) || 0,
        karatFilter: 'any',
        createdAt: Date.now()
      });
    }
    localStorage.setItem('goldtracker_goals_v2', JSON.stringify(goals));
  }

  // --- alerts: seed from old buy-threshold setting, add price-target default ---
  if (!localStorage.getItem('goldtracker_alerts_v2')) {
    const oldThreshold = parseFloat(localStorage.getItem('goldtracker_buyThreshold') || '3');
    const alerts = [{
      id: uid(),
      type: 'drop_vs_avg',
      currency: 'INR',
      karat: '24',
      thresholdPct: oldThreshold,
      enabled: true,
      lastTriggered: null
    }];
    localStorage.setItem('goldtracker_alerts_v2', JSON.stringify(alerts));
  }

  // --- primary currency for portfolio/dashboard headline ---
  if (!localStorage.getItem('goldtracker_primaryCurrency')) {
    const selected = JSON.parse(localStorage.getItem('goldtracker_currencies') || '["INR","SAR"]');
    localStorage.setItem('goldtracker_primaryCurrency', selected[0] || 'INR');
  }

  // --- v3: normalize karat to Number everywhere it's stored, add karat display selection ---
  if (currentVersion < 3) {
    const purchases = JSON.parse(localStorage.getItem('goldtracker_purchases_v2') || '[]')
      .map(p => ({ ...p, karat: Number(p.karat) || 22 }));
    localStorage.setItem('goldtracker_purchases_v2', JSON.stringify(purchases));

    const goals = JSON.parse(localStorage.getItem('goldtracker_goals_v2') || '[]')
      .map(g => ({ ...g, karatFilter: g.karatFilter === 'any' ? 'any' : Number(g.karatFilter) || 'any' }));
    localStorage.setItem('goldtracker_goals_v2', JSON.stringify(goals));

    const alerts = JSON.parse(localStorage.getItem('goldtracker_alerts_v2') || '[]')
      .map(a => ({ ...a, karat: a.karat ? Number(a.karat) : a.karat }));
    localStorage.setItem('goldtracker_alerts_v2', JSON.stringify(alerts));

    if (!localStorage.getItem('goldtracker_karats')) {
      localStorage.setItem('goldtracker_karats', JSON.stringify([22, 24]));
    }
  }

  localStorage.setItem('goldtracker_schema_version', String(SCHEMA_VERSION));
}

/* ----------------------------------------------------------------------------
   SETTINGS — thin wrapper over localStorage, one key per setting (unchanged
   from Phase 0 so old values keep working without any transform needed).
---------------------------------------------------------------------------- */

const Settings = {
  get(key, fallback) {
    const v = localStorage.getItem('goldtracker_' + key);
    return v === null ? fallback : v;
  },
  getNum(key, fallback) {
    const v = localStorage.getItem('goldtracker_' + key);
    return v === null ? fallback : parseFloat(v);
  },
  getJSON(key, fallback) {
    const v = localStorage.getItem('goldtracker_' + key);
    return v === null ? fallback : JSON.parse(v);
  },
  set(key, value) {
    localStorage.setItem('goldtracker_' + key, typeof value === 'string' ? value : JSON.stringify(value));
  },
  setNum(key, value) {
    localStorage.setItem('goldtracker_' + key, String(value));
  }
};

function getSelectedCurrencies() {
  const saved = Settings.getJSON('currencies', ['INR', 'SAR']);
  return saved.length ? saved : ['INR'];
}

function getSelectedKarats() {
  const saved = Settings.getJSON('karats', [22, 24]);
  return saved.length ? saved : [22];
}

function getPrimaryCurrency() {
  return Settings.get('primaryCurrency', 'INR');
}

function getPremiumPctFor(code) {
  if (code === 'INR') return Settings.getNum('inrPremium', 14);
  if (code === 'SAR') return Settings.getNum('sarPremium', 4);
  return Settings.getNum('otherPremium', 0);
}

function getMakingChargePct() {
  return Settings.getNum('makingCharge', 12);
}

function getWeightGrams() {
  return Settings.getNum('weight', 10);
}

/* ----------------------------------------------------------------------------
   PRICE FETCH + COMPUTATION
---------------------------------------------------------------------------- */

const GOLD_URL = 'https://api.gold-api.com/price/XAU';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

let lastResult = null;

function notify(title, body) {
  if (Settings.get('notif', '0') !== '1') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png', tag: title });
    });
  } else {
    new Notification(title, { body, icon: './icon-192.png' });
  }
}

async function fetchGoldPrice() {
  setStatus('', 'Fetching price...');
  try {
    const goldRes = await fetch(GOLD_URL);
    if (!goldRes.ok) throw new Error('gold-api error ' + goldRes.status);
    const goldData = await goldRes.json();
    const usdPerOz = goldData.price ?? goldData.rate ?? goldData.rates?.XAU ?? goldData.data?.price;
    if (!usdPerOz) throw new Error('Unexpected gold price response shape');

    const fxRes = await fetch(FX_URL);
    if (!fxRes.ok) throw new Error('fx-api error ' + fxRes.status);
    const fxData = await fxRes.json();

    const usd24 = usdPerOz / GRAMS_PER_OZ;

    const prices = {};
    CURRENCIES.forEach(c => {
      const rate = fxData.rates[c.code];
      if (!rate) return;
      const premium = 1 + getPremiumPctFor(c.code) / 100;
      const spot = {}, prem = {};
      KARATS.forEach(k => {
        const usdK = usd24 * purityRatio(k);
        spot[k] = usdK * rate;
        prem[k] = usdK * rate * premium;
      });
      prices[c.code] = {
        rate, spot, prem,
        // flat aliases kept for the many existing 22K/24K-specific call sites
        spot24: spot[24], spot22: spot[22], prem24: prem[24], prem22: prem[22]
      };
    });

    const result = { usdPerOz, prices, timestamp: Date.now() };

    lastResult = result;
    Settings.set('last', result);
    saveHistoryPoint(result);
    saveToLog(result);
    evaluateAlerts(result);

    renderAll();
    setStatus('live', 'Live');
    return result;
  } catch (err) {
    console.error(err);
    setStatus('err', 'Fetch failed — will retry');
    renderStaleBanner();
    return null;
  }
}

/** Current premium (local-market) price per gram for a given currency + any karat (18/21/22/24) */
function currentPrice(currency, karat) {
  if (!lastResult || !lastResult.prices[currency]) return null;
  return lastResult.prices[currency].prem[Number(karat)] ?? null;
}

/* ----------------------------------------------------------------------------
   HISTORY, LOG, STATUS / STALE-DATA TRACKING
---------------------------------------------------------------------------- */

function saveHistoryPoint(r) {
  let hist = Settings.getJSON('history', []);
  hist.push({ t: r.timestamp, usd: r.usdPerOz });
  if (hist.length > 600) hist = hist.slice(hist.length - 600);
  Settings.set('history', hist);
}

function saveToLog(r) {
  let log = Settings.getJSON('log', []);
  log.unshift(r);
  log = log.slice(0, 8);
  Settings.set('log', log);
}

function rollingAverage(hist, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const inWindow = hist.filter(p => p.t >= cutoff);
  const use = inWindow.length >= 3 ? inWindow : hist;
  if (!use.length) return null;
  return use.reduce((sum, p) => sum + p.usd, 0) / use.length;
}

/* ----------------------------------------------------------------------------
   TREND BACKFILL (Increment 5)
   Authentic 90-day history from gold-api.com's /history endpoint (same
   provider/domain the app already uses for the live price), merged with the
   existing in-app check-in history rather than replacing it:
     - gold-api.com fills in every day BEFORE your first in-app check —
       so the trend/Buy Signal/drop_vs_avg alerts are meaningful from day
       one, not after weeks of waiting for local history to accumulate.
     - Your own in-app checks remain the live tail — today's price is
       always whatever you actually last saw, not a cached daily close.
   Cached for 24h (`goldtracker_trendCache`) so this is at most one API
   call per day per browser — the free tier is 10 requests/hour, and daily
   caching keeps real-world usage nowhere near that even shared across a
   handful of people using the app. If the fetch fails for any reason
   (network, key, rate limit), everything silently falls back to
   in-app-only history, same as before this increment.
---------------------------------------------------------------------------- */

const GOLD_API_KEY = '4715ac8a399df3cf41608ca2590818f5ab5fa10393456164c540e1acb4b8e00e';
const TREND_DAYS = 90;
const TREND_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function dateStrToMs(dateStr) {
  // Midday UTC avoids a date being nudged into the wrong day by timezone rounding.
  return new Date(dateStr + 'T12:00:00Z').getTime();
}

/** Confirmed live shape (2026-07): a GET to
 *  /history?symbol=XAU&startTimestamp=...&endTimestamp=...&groupBy=day
 *  returns a plain array, most-recent-first:
 *    [{ "day": "2026-07-08 00:00:00", "max_price": "4134.700200" }, ...]
 *  Note this is the day's HIGH, not a closing price — the free tier
 *  doesn't expose OHLC/close separately. Good enough for a trend line;
 *  worth knowing if the chart looks slightly more jagged/peaky than a
 *  close-based series would. Still tries other common field names/shapes
 *  defensively in case the response format differs for other query
 *  combinations or changes later. */
function parseTrendHistoryResponse(data) {
  const raw = Array.isArray(data) ? data
    : Array.isArray(data?.history) ? data.history
    : Array.isArray(data?.prices) ? data.prices
    : Array.isArray(data?.data) ? data.data
    : Array.isArray(data?.results) ? data.results
    : [];

  return raw.map(item => {
    const date = item.day || item.date || item.timestamp || item.updatedAt || null;
    const price = item.max_price ?? item.price ?? item.close ?? item.rate ?? item.value ?? null;
    return (date && price != null) ? { date: String(date).slice(0, 10), usdPerOz: Number(price) } : null;
  }).filter(Boolean);
}

async function fetchTrendBackfill(force) {
  const cache = Settings.getJSON('trendCache', null);
  const isFresh = cache && cache.fetchedAt && (Date.now() - cache.fetchedAt < TREND_CACHE_MAX_AGE_MS);
  if (isFresh && !force) return;

  try {
    const endTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = endTimestamp - TREND_DAYS * 24 * 60 * 60;
    const url = `https://api.gold-api.com/history?symbol=XAU&startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&groupBy=day`;
    const res = await fetch(url, { headers: { 'x-api-key': GOLD_API_KEY } });
    if (!res.ok) throw new Error('Trend history fetch failed: HTTP ' + res.status);
    const data = await res.json();
    const points = parseTrendHistoryResponse(data);
    if (!points.length) throw new Error('Trend history response had no recognizable data points');
    Settings.set('trendCache', { fetchedAt: Date.now(), days: TREND_DAYS, points, source: 'gold-api.com' });
  } catch (err) {
    console.error('Trend backfill failed — falling back to in-app-only history.', err);
    // Deliberately don't clear an existing cache on failure; a stale-but-valid
    // backfill is still more useful than none until the next successful fetch.
  }
}

/** Combines the (rarely-fetched) backfill with the (frequently-updated) local
 *  in-app history: backfill covers everything before your first local check,
 *  local history covers everything from then on — so there's never a
 *  duplicate or conflicting point for the same day. */
function getMergedHistory() {
  const local = Settings.getJSON('history', []);
  const cache = Settings.getJSON('trendCache', null);
  const backfill = ((cache && cache.points) || []).map(p => ({ t: dateStrToMs(p.date), usd: p.usdPerOz }));

  if (!local.length) return backfill.sort((a, b) => a.t - b.t);

  const earliestLocalT = Math.min(...local.map(p => p.t));
  const olderBackfill = backfill.filter(p => p.t < earliestLocalT);
  return [...olderBackfill, ...local].sort((a, b) => a.t - b.t);
}

/* ----------------------------------------------------------------------------
   BUY SIGNAL (Increment 3 — Home, above the portfolio-value teaser)
   Purely derived from the same price-history array the sparkline already
   uses — no new data source, no chart, just a plain-language read on today's
   spot vs. its 7-day and 30-day trailing averages.
---------------------------------------------------------------------------- */

function computeBuySignal() {
  if (!lastResult) return null;
  const hist = getMergedHistory();
  const avg7 = rollingAverage(hist, 7);
  const avg30 = rollingAverage(hist, 30);
  if (!avg7 || !avg30) return null;

  const cur = lastResult.usdPerOz;
  // Positive = today is BELOW that average (a dip); negative = above it.
  const pctVs30 = ((avg30 - cur) / avg30) * 100;
  const pctVs7 = ((avg7 - cur) / avg7) * 100;

  // The % gap is currency/premium-agnostic (same ratio applies to every
  // karat and currency), so 22K is used here purely as a familiar reference
  // point in the reason text, not as the basis of the calculation.
  const refKarat = '22K';

  if (pctVs30 > 3) {
    return { key: 'good_window', label: 'Good buy window', cls: 'good',
      reason: `${refKarat} is ${pctVs30.toFixed(1)}% below its 30-day average.` };
  }
  if (pctVs7 > 1.5) {
    return { key: 'good_dip', label: 'Good dip', cls: 'good',
      reason: `${refKarat} is ${pctVs7.toFixed(1)}% below its 7-day average.` };
  }
  if (pctVs30 < -2) {
    return { key: 'wait', label: 'Wait', cls: 'bad',
      reason: `${refKarat} is ${Math.abs(pctVs30).toFixed(1)}% above its 30-day average.` };
  }
  return { key: 'neutral', label: 'Neutral', cls: 'neutral',
    reason: `${refKarat} is within ±1.5% of its recent 7- and 30-day averages.` };
}

function renderBuySignal() {
  const card = $('buySignalCard');
  if (!card) return;
  const signal = computeBuySignal();
  if (!signal) { card.style.display = 'none'; return; }
  card.style.display = '';
  card.className = 'buy-signal-card ' + signal.cls;
  $('buySignalLabel').textContent = signal.label;
  $('buySignalReason').textContent = signal.reason;
}

function setStatus(state, text) {
  const dot = $('statusDot');
  if (!dot) return;
  dot.className = 'dot' + (state === 'live' ? ' live' : state === 'err' ? ' err' : '');
  $('statusText').textContent = text;
}

/** How many minutes since the last successful fetch. Null if never fetched. */
function minutesSinceLastUpdate() {
  if (!lastResult) return null;
  return (Date.now() - lastResult.timestamp) / 60000;
}

/** Data counts as stale if it's older than 1.5x the configured refresh interval,
 *  with a 30-minute floor so a 15-30 min interval doesn't nag immediately. */
function isStale() {
  const mins = minutesSinceLastUpdate();
  if (mins === null) return false;
  const interval = Settings.getNum('interval', 120);
  const staleAfter = Math.max(30, interval * 1.5);
  return mins > staleAfter;
}

function renderStaleBanner() {
  const el = $('staleBanner');
  if (!el) return;
  if (isStale()) {
    const mins = Math.round(minutesSinceLastUpdate());
    const label = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    el.style.display = 'block';
    el.textContent = `⚠ Price data is ${label} old — reopen with a connection to refresh.`;
  } else {
    el.style.display = 'none';
  }
}

function renderLastUpdated() {
  const el = $('lastUpdatedText');
  if (!el) return;
  if (!lastResult) { el.textContent = 'Never updated yet'; return; }
  const mins = minutesSinceLastUpdate();
  let label;
  if (mins < 1) label = 'just now';
  else if (mins < 60) label = `${Math.round(mins)}m ago`;
  else label = `${Math.round(mins / 60)}h ago`;
  el.textContent = `Updated ${label} (${new Date(lastResult.timestamp).toLocaleTimeString()})`;
  renderStaleBanner();
}

/* ----------------------------------------------------------------------------
   PURCHASES + PORTFOLIO
---------------------------------------------------------------------------- */

function getPurchases() {
  return Settings.getJSON('purchases_v2', []);
}

function savePurchases(list) {
  Settings.set('purchases_v2', list);
  Store.emit('purchases:changed');
}

/**
 * Portfolio is computed grouped by (currency, karat) so avg-price-per-gram is
 * never misleading (22K and 24K are not fungible per gram). Money totals
 * (invested / current value / gain-loss) are always summed within a single
 * currency, never across currencies — no invented FX conversion here.
 */
function computePortfolio() {
  const purchases = getPurchases();
  const groups = {}; // key: "CURRENCY|KARAT"

  purchases.forEach(p => {
    const key = `${p.currency}|${p.karat}`;
    if (!groups[key]) groups[key] = { currency: p.currency, karat: p.karat, grams: 0, invested: 0, count: 0 };
    groups[key].grams += parseFloat(p.grams) || 0;
    groups[key].invested += parseFloat(p.price) || 0;
    groups[key].count += 1;
  });

  return Object.values(groups).map(g => {
    const avgBuyPrice = g.grams > 0 ? g.invested / g.grams : 0;
    const curPrice = currentPrice(g.currency, g.karat);
    const currentValue = curPrice !== null ? g.grams * curPrice : null;
    const gainLoss = currentValue !== null ? currentValue - g.invested : null;
    const gainLossPct = currentValue !== null && g.invested > 0 ? (gainLoss / g.invested) * 100 : null;
    return { ...g, avgBuyPrice, currentPricePerGram: curPrice, currentValue, gainLoss, gainLossPct };
  });
}

/** Headline portfolio numbers for the Dashboard, restricted to one currency
 *  (money amounts within a currency are always safely addable across karats). */
function computePortfolioHeadline(currency) {
  const groups = computePortfolio().filter(g => g.currency === currency);
  const totalGrams = groups.reduce((s, g) => s + g.grams, 0);
  const totalInvested = groups.reduce((s, g) => s + g.invested, 0);
  const totalCurrentValue = groups.every(g => g.currentValue !== null)
    ? groups.reduce((s, g) => s + (g.currentValue || 0), 0)
    : null;
  const gainLoss = totalCurrentValue !== null ? totalCurrentValue - totalInvested : null;
  const gainLossPct = gainLoss !== null && totalInvested > 0 ? (gainLoss / totalInvested) * 100 : null;
  return { currency, totalGrams, totalInvested, totalCurrentValue, gainLoss, gainLossPct };
}

function totalGramsOwned() {
  return getPurchases().reduce((s, p) => s + (parseFloat(p.grams) || 0), 0);
}

/* ----------------------------------------------------------------------------
   GOALS (multiple, using owned grams from purchase records)
---------------------------------------------------------------------------- */

function getGoals() {
  return Settings.getJSON('goals_v2', []);
}

function saveGoals(list) {
  Settings.set('goals_v2', list);
  Store.emit('goals:changed');
}

function gramsOwnedFor(karatFilter) {
  const purchases = getPurchases();
  if (karatFilter === 'any') return purchases.reduce((s, p) => s + (parseFloat(p.grams) || 0), 0);
  return purchases
    .filter(p => String(p.karat) === String(karatFilter))
    .reduce((s, p) => s + (parseFloat(p.grams) || 0), 0);
}

/** Grams/month accumulation pace since the first purchase (for ETA estimate). */
function accumulationPaceGramsPerMonth(karatFilter) {
  const purchases = getPurchases()
    .filter(p => karatFilter === 'any' || String(p.karat) === String(karatFilter))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (purchases.length < 2) return null;
  const firstDate = new Date(purchases[0].date);
  const monthsElapsed = Math.max(1, (Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const totalGrams = purchases.reduce((s, p) => s + (parseFloat(p.grams) || 0), 0);
  return totalGrams / monthsElapsed;
}

function computeGoalProgress(goal) {
  const owned = gramsOwnedFor(goal.karatFilter);
  const pct = goal.targetGrams > 0 ? Math.min(100, (owned / goal.targetGrams) * 100) : 0;
  const remaining = Math.max(0, goal.targetGrams - owned);

  const karatForPrice = goal.karatFilter === 'any' ? 22 : goal.karatFilter;
  const primaryCurrency = getPrimaryCurrency();
  const pricePerGram = currentPrice(primaryCurrency, karatForPrice);
  const making = 1 + getMakingChargePct() / 100;
  const estCost = pricePerGram !== null ? remaining * pricePerGram * making : null;

  const pace = accumulationPaceGramsPerMonth(goal.karatFilter);
  let etaLabel = null;
  if (remaining <= 0) {
    etaLabel = 'Reached';
  } else if (pace && pace > 0) {
    const monthsLeft = remaining / pace;
    const etaDate = new Date();
    etaDate.setMonth(etaDate.getMonth() + Math.round(monthsLeft));
    etaLabel = `~${etaDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} at current pace`;
  }

  return { owned, pct, remaining, estCost, primaryCurrency, etaLabel };
}

/* ----------------------------------------------------------------------------
   ALERT MANAGER — multiple alert types, evaluated on every successful fetch.
   Each rule fires a notification only on the transition into a triggered
   state (not every check while it stays triggered), to avoid alert spam.
---------------------------------------------------------------------------- */

function getAlerts() {
  return Settings.getJSON('alerts_v2', []);
}

function saveAlerts(list) {
  Settings.set('alerts_v2', list);
  Store.emit('alerts:changed');
}

function alertLabel(a) {
  if (a.type === 'drop_vs_avg') {
    return `${a.currency} ${a.karat}K drops ${a.thresholdPct}% below its 30-day average`;
  }
  if (a.type === 'price_target') {
    const dir = a.direction === 'above' ? 'rises above' : 'falls below';
    return `${a.currency} ${a.karat}K ${dir} ${money(a.currency, a.thresholdValue)}/g`;
  }
  if (a.type === 'goal_milestone') {
    const goal = getGoals().find(g => g.id === a.goalId);
    return `"${goal ? goal.name : 'Goal'}" reaches ${a.milestonePct}% progress`;
  }
  return 'Unknown alert';
}

function evaluateAlerts(snapshot) {
  const alerts = getAlerts();
  const hist = getMergedHistory();
  const triggeredNow = [];
  let changed = false;

  alerts.forEach(a => {
    if (!a.enabled) return;
    let isTriggered = false;
    let message = '';

    if (a.type === 'drop_vs_avg') {
      const avg = rollingAverage(hist, 30);
      const p = snapshot.prices[a.currency];
      if (avg && p) {
        const usdEquivalent = snapshot.usdPerOz; // compare in USD terms, currency-agnostic
        const dropPct = ((avg - usdEquivalent) / avg) * 100;
        if (dropPct >= a.thresholdPct) {
          isTriggered = true;
          message = `Gold is ${dropPct.toFixed(1)}% below its 30-day average. ${a.currency} ${a.karat}K ≈ ${money(a.currency, p.prem[Number(a.karat)])}/g.`;
        }
      }
    }

    if (a.type === 'price_target') {
      const p = snapshot.prices[a.currency];
      if (p) {
        const cur = p.prem[Number(a.karat)];
        if (a.direction === 'above' && cur >= a.thresholdValue) isTriggered = true;
        if (a.direction === 'below' && cur <= a.thresholdValue) isTriggered = true;
        if (isTriggered) message = `${a.currency} ${a.karat}K is now ${money(a.currency, cur)}/g — your target was ${money(a.currency, a.thresholdValue)}.`;
      }
    }

    if (a.type === 'goal_milestone') {
      const goal = getGoals().find(g => g.id === a.goalId);
      if (goal) {
        const progress = computeGoalProgress(goal);
        if (progress.pct >= a.milestonePct) {
          const already = a.triggeredMilestones || [];
          if (!already.includes(a.milestonePct)) {
            isTriggered = true;
            message = `"${goal.name}" has reached ${a.milestonePct}% of its ${goal.targetGrams}g target.`;
            a.triggeredMilestones = [...already, a.milestonePct];
            changed = true;
          }
        }
      }
    }

    const wasTriggered = a.lastTriggered === 'active';
    if (isTriggered && a.type !== 'goal_milestone' && !wasTriggered) {
      triggeredNow.push({ alert: a, message });
      a.lastTriggered = 'active';
      changed = true;
    } else if (isTriggered && a.type === 'goal_milestone' && message) {
      triggeredNow.push({ alert: a, message });
    } else if (!isTriggered && a.type !== 'goal_milestone' && wasTriggered) {
      a.lastTriggered = null;
      changed = true;
    }
  });

  if (changed) saveAlerts(alerts);

  if (triggeredNow.length) {
    Settings.set('alertsSeen', '0');
    updateAlertsBadge();
  }

  triggeredNow.forEach(({ message }) => {
    notify('Gold price alert', message);
  });

  return triggeredNow;
}






/* ============================================================================
   RENDERING
   ============================================================================ */

function renderAll() {
  renderDashboard();
  renderBuySignal();
  renderPriceCards();
  renderCurrencyChips();
  renderKaratChips();
  renderPortfolio();
  renderGoals();
  renderPurchases();
  renderAlerts();
  renderNotificationHealth();
  renderTrend(getMergedHistory());
  renderComparison();
  renderLog();
  renderLastUpdated();
}

/* ---------- DASHBOARD ---------- */

function renderDashboard() {
  const primary = getPrimaryCurrency();

  if (!lastResult) {
    $('dashPortfolioValue').textContent = '--';
    $('dashGainLoss').textContent = '--';
    $('dashGrams').textContent = '--';
    renderPriceTierRow(primary, null);
    return;
  }

  const p = lastResult.prices[primary];
  renderPriceTierRow(primary, p);

  const headline = computePortfolioHeadline(primary);
  $('dashGrams').textContent = fmt(totalGramsOwned()) + ' g';

  const valueWrap = $('dashValueWrap');
  const emptyState = $('dashEmptyState');

  if (headline.totalInvested > 0) {
    if (valueWrap) valueWrap.style.display = '';
    if (emptyState) emptyState.style.display = 'none';
    $('dashPortfolioValue').textContent = headline.totalCurrentValue !== null
      ? money(primary, headline.totalCurrentValue) : '--';
    const gl = headline.gainLoss;
    const glPct = headline.gainLossPct;
    const glEl = $('dashGainLoss');
    if (gl !== null) {
      const sign = gl >= 0 ? '+' : '';
      glEl.textContent = `${sign}${money(primary, gl)} (${sign}${glPct.toFixed(1)}%)`;
      glEl.className = 'dash-gainloss ' + (gl >= 0 ? 'positive' : 'negative');
    }
  } else {
    if (valueWrap) valueWrap.style.display = 'none';
    if (emptyState) emptyState.style.display = '';
  }

  const goals = getGoals();
  const goalMini = $('dashGoalMini');
  if (!goals.length) {
    goalMini.innerHTML = `<span class="subnote">No goals set yet — add one below.</span>`;
  } else {
    const withProgress = goals.map(g => ({ g, progress: computeGoalProgress(g) }));
    withProgress.sort((a, b) => b.progress.pct - a.progress.pct);
    const top = withProgress[0];
    goalMini.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
        <span>${top.g.name}</span><span>${top.progress.pct.toFixed(0)}%</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${top.progress.pct}%;"></div></div>
    `;
  }
}

/** Home's structural spot/retail/jeweller distinction (Increment 2 trust fix) —
 *  a persistent labeled row instead of requiring the user to read a sentence
 *  to understand which number means what. */
function renderPriceTierRow(currency, p) {
  const el = $('priceTierRow');
  if (!el) return;
  if (!p) {
    el.innerHTML = `<div class="subnote">Prices load in a moment...</div>`;
    return;
  }
  const making = 1 + getMakingChargePct() / 100;
  const row = (karat) => {
    const spot = p.spot[karat], retail = p.prem[karat], jeweller = retail * making;
    return `
      <div class="tier-row">
        <span class="tier-karat">${karat}K</span>
        <span>${money(currency, spot)}</span>
        <span>${money(currency, retail)}</span>
        <span>${money(currency, jeweller)}</span>
      </div>
    `;
  };
  el.innerHTML = `
    <div class="tier-row tier-header">
      <span></span><span>Spot</span><span>Retail</span><span>Jeweller</span>
    </div>
    ${row(24)}
    ${row(22)}
  `;
}

/* ---------- PRICE CARDS (multi-currency grid) ---------- */

function renderPriceCards() {
  if (!lastResult) return;
  $('spotUsd').textContent = '$' + fmt(lastResult.usdPerOz);

  const weight = getWeightGrams();
  const weightLabel = weight === 1 ? 'per gram' : (weight === 11.664 ? 'per tola' : `for ${weight}g`);
  const making = 1 + getMakingChargePct() / 100;
  const selectedCurrencies = getSelectedCurrencies();
  const selectedKarats = getSelectedKarats();
  const grid = $('priceCardsGrid');

  if (!selectedCurrencies.length || !selectedKarats.length) {
    grid.innerHTML = `<div class="card full-card"><div class="subnote">Pick at least one currency and one karat in Settings below.</div></div>`;
  } else {
    let html = '';
    selectedCurrencies.forEach(code => {
      const p = lastResult.prices[code];
      if (!p) return;
      const meta = currencyMeta(code);
      const sym = meta.symbol;
      selectedKarats.slice().sort((a, b) => b - a).forEach(karat => {
        const prem = p.prem[karat], spot = p.spot[karat];
        if (prem === undefined) return;
        html += `
          <div class="card">
            <div class="karat">${karat}K GOLD</div>
            <div class="currency-label">${code} ${weightLabel}</div>
            <div class="amount">${sym}${fmt(prem * weight)}</div>
            <div class="unit">spot: ${sym}${fmt(spot)}/g · jeweller ≈ ${sym}${fmt(prem * weight * making)}</div>
          </div>
        `;
      });
    });
    grid.innerHTML = html;
  }

  const topLine = selectedCurrencies
    .filter(code => lastResult.prices[code])
    .map(code => { const m = currencyMeta(code); return `${m.symbol}${fmt(lastResult.prices[code].spot24)}`; })
    .join(' / ');
  $('spotTopLine').textContent = topLine ? `≈ ${topLine} per gram (24K spot)` : '--';
}

function renderKaratChips() {
  const selected = getSelectedKarats();
  const wrap = $('karatChips');
  if (!wrap) return;
  wrap.innerHTML = KARATS.map(k => `
    <span class="currency-chip ${selected.includes(k) ? 'active' : ''}" data-karat="${k}">${k}K</span>
  `).join('');
  wrap.querySelectorAll('.currency-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      let sel = getSelectedKarats();
      const k = Number(chip.dataset.karat);
      if (sel.includes(k)) {
        if (sel.length === 1) return;
        sel = sel.filter(x => x !== k);
      } else {
        sel.push(k);
      }
      Settings.set('karats', sel);
      renderKaratChips();
      if (lastResult) renderPriceCards();
    });
  });
}

function renderCurrencyChips() {
  const selected = getSelectedCurrencies();
  const wrap = $('currencyChips');
  wrap.innerHTML = CURRENCIES.map(c => `
    <span class="currency-chip ${selected.includes(c.code) ? 'active' : ''}" data-code="${c.code}" title="${c.name}">${c.code}</span>
  `).join('');
  wrap.querySelectorAll('.currency-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      let sel = getSelectedCurrencies();
      const code = chip.dataset.code;
      if (sel.includes(code)) {
        if (sel.length === 1) return;
        sel = sel.filter(c => c !== code);
      } else {
        sel.push(code);
      }
      Settings.set('currencies', sel);
      renderCurrencyChips();
      if (lastResult) renderPriceCards();
    });
  });
}

/* ---------- PORTFOLIO ---------- */

function renderPortfolio() {
  renderAllocationBar();

  const groups = computePortfolio();
  const el = $('portfolioBody');
  if (!groups.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">◆</div>
        <div class="empty-state-msg">No purchases yet — add your first one and this fills in automatically.</div>
        <button class="btn primary-btn empty-state-cta" id="portfolioEmptyCta">+ Add your first purchase</button>
      </div>
    `;
    $('portfolioEmptyCta').addEventListener('click', openAddPurchaseSheet);
    return;
  }
  el.innerHTML = groups.map(g => {
    const glClass = g.gainLoss === null ? '' : (g.gainLoss >= 0 ? 'positive' : 'negative');
    const glText = g.gainLoss === null ? 'current price unavailable'
      : `${g.gainLoss >= 0 ? '+' : ''}${money(g.currency, g.gainLoss)} (${g.gainLoss >= 0 ? '+' : ''}${g.gainLossPct.toFixed(1)}%)`;
    return `
      <div class="portfolio-group">
        <div class="portfolio-group-title">${g.karat}K · ${g.currency} <span class="subnote">(${g.count} purchase${g.count > 1 ? 's' : ''}, ${fmt(g.grams)}g)</span></div>
        <div class="cmp-row"><span>Avg buy price</span><span class="cmp-val">${money(g.currency, g.avgBuyPrice)}/g</span></div>
        <div class="cmp-row"><span>Current price</span><span class="cmp-val">${g.currentPricePerGram !== null ? money(g.currency, g.currentPricePerGram) + '/g' : '--'}</span></div>
        <div class="cmp-row"><span>Invested</span><span class="cmp-val">${money(g.currency, g.invested)}</span></div>
        <div class="cmp-row"><span>Current value</span><span class="cmp-val">${g.currentValue !== null ? money(g.currency, g.currentValue) : '--'}</span></div>
        <div class="cmp-row"><span>Gain / loss</span><span class="cmp-val ${glClass}">${glText}</span></div>
      </div>
    `;
  }).join('');
}

/** Grams owned per karat, regardless of currency — grams are currency-independent
 *  so this sum is always safe (unlike money totals, which are not, see computePortfolio). */
function computeAllocationByKarat() {
  const purchases = getPurchases();
  const totals = {};
  KARATS.forEach(k => { totals[k] = 0; });
  purchases.forEach(p => {
    const k = Number(p.karat);
    if (totals[k] === undefined) totals[k] = 0;
    totals[k] += parseFloat(p.grams) || 0;
  });
  return totals;
}

let purchaseFilterKarat = null;

function renderAllocationBar() {
  const el = $('allocationBar');
  if (!el) return;
  const totals = computeAllocationByKarat();
  const grand = Object.values(totals).reduce((s, v) => s + v, 0);

  if (grand === 0) {
    el.innerHTML = `<div class="subnote">Allocation by karat appears once you've logged a purchase.</div>`;
    return;
  }

  const colors = { 18: '#8a6f1f', 21: '#a68a2e', 22: '#c49a2f', 24: '#d4af37' };
  const segments = KARATS.filter(k => totals[k] > 0).map(k => {
    const pct = (totals[k] / grand) * 100;
    return `<div class="alloc-segment" data-karat="${k}" style="width:${pct}%; background:${colors[k]};" title="${k}K: ${fmt(totals[k])}g (${pct.toFixed(0)}%)"></div>`;
  }).join('');

  const legend = KARATS.filter(k => totals[k] > 0).map(k => `
    <span class="alloc-legend-item ${purchaseFilterKarat === k ? 'active' : ''}" data-karat="${k}">
      <span class="alloc-dot" style="background:${colors[k]};"></span>${k}K · ${fmt(totals[k])}g
    </span>
  `).join('');

  el.innerHTML = `<div class="alloc-bar">${segments}</div><div class="alloc-legend">${legend}</div>`;

  el.querySelectorAll('[data-karat]').forEach(node => {
    node.addEventListener('click', () => {
      const k = Number(node.dataset.karat);
      purchaseFilterKarat = purchaseFilterKarat === k ? null : k;
      renderAllocationBar();
      renderPurchases();
    });
  });
}

/* ---------- GOALS ---------- */


function renderGoals() {
  const goals = getGoals();
  const el = $('goalsList');
  if (!goals.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">◆</div>
        <div class="empty-state-msg">No goals yet — set a weight target to track your progress toward it.</div>
        <button class="btn primary-btn empty-state-cta" id="goalsEmptyCta">+ Add your first goal</button>
      </div>
    `;
    $('goalsEmptyCta').addEventListener('click', () => { openGoalForm(); $('goalName')?.focus(); });
    return;
  }
  el.innerHTML = goals.map(g => {
    const progress = computeGoalProgress(g);
    const karatLabel = g.karatFilter === 'any' ? 'any karat' : `${g.karatFilter}K only`;
    return `
      <div class="goal-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="color:var(--gold); font-weight:700;">${g.name}</span>
          <span class="del" data-id="${g.id}" style="color:var(--red); cursor:pointer; font-size:13px;">✕</span>
        </div>
        <div class="subnote">${karatLabel} · target ${g.targetGrams}g</div>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:8px;">
          <span>${fmt(progress.owned)}g owned</span><span>${progress.pct.toFixed(0)}%</span>
        </div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${progress.pct}%;"></div></div>
        <div class="subnote" style="margin-top:6px;">
          ${progress.remaining > 0
            ? `${fmt(progress.remaining)}g remaining${progress.estCost !== null ? ' · ~' + money(progress.primaryCurrency, progress.estCost) + ' at today\'s rate' : ''}${progress.etaLabel ? ' · ETA ' + progress.etaLabel : ''}`
            : '🎉 Goal reached'}
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.del').forEach(btn => {
    btn.addEventListener('click', () => {
      const remaining = getGoals().filter(g => g.id !== btn.dataset.id);
      saveGoals(remaining); // emits 'goals:changed' -> renderGoals, renderDashboard, populateGoalAlertDropdown
    });
  });
}

/* ---------- PURCHASES (with edit + notes) ---------- */

let editingPurchaseId = null;

function populatePCurrencyOptions() {
  const sel = $('pCurrency');
  sel.innerHTML = CURRENCIES.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
}

function renderPurchases() {
  const all = getPurchases();
  const purchases = purchaseFilterKarat === null ? all : all.filter(p => Number(p.karat) === purchaseFilterKarat);
  const tbody = $('purchaseTbody');
  const table = $('purchaseTable');
  const filterNote = $('purchaseFilterNote');
  const emptyState = $('purchasesEmptyState');

  if (filterNote) {
    filterNote.style.display = purchaseFilterKarat === null ? 'none' : 'flex';
    filterNote.querySelector('span').textContent = `Showing ${purchaseFilterKarat}K only`;
  }

  if (!all.length) {
    table.style.display = 'none';
    if (emptyState) emptyState.style.display = '';
    if (filterNote) filterNote.style.display = 'none';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';
  table.style.display = '';

  if (!purchases.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="subnote">No ${purchaseFilterKarat}K purchases logged.</td></tr>`;
    return;
  }

  tbody.innerHTML = purchases.map(p => `
    <tr>
      <td>${p.date}</td>
      <td>${p.karat}K</td>
      <td>${parseFloat(p.grams).toFixed(2)}g</td>
      <td>${currencyMeta(p.currency).symbol}${fmt(p.price)}</td>
      <td class="subnote" style="max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.notes || ''}">${p.notes || ''}</td>
      <td class="edit" data-id="${p.id}" style="cursor:pointer; text-align:right;">✎</td>
      <td class="del" data-id="${p.id}" style="color:var(--red); cursor:pointer; text-align:right;">✕</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.del').forEach(td => {
    td.addEventListener('click', () => {
      const remaining = getPurchases().filter(p => p.id !== td.dataset.id);
      savePurchases(remaining); // emits 'purchases:changed' -> renderPurchases, renderPortfolio, renderGoals, renderDashboard, renderAllocationBar
    });
  });

  tbody.querySelectorAll('.edit').forEach(td => {
    td.addEventListener('click', () => {
      const p = getPurchases().find(x => x.id === td.dataset.id);
      if (!p) return;
      editingPurchaseId = p.id;
      $('pDate').value = p.date;
      $('pKarat').value = p.karat;
      $('pGrams').value = p.grams;
      $('pPrice').value = p.price;
      $('pCurrency').value = p.currency;
      $('pJeweller').value = p.jeweller || '';
      $('pNotes').value = p.notes || '';
      $('addPurchaseBtn').textContent = 'Save changes';
      $('cancelEditBtn').style.display = 'inline-block';
      $('purchaseSheetTitle').textContent = 'Edit purchase';
      openPurchaseForm();
    });
  });
}

function resetPurchaseForm() {
  editingPurchaseId = null;
  $('pDate').value = new Date().toISOString().slice(0, 10);
  $('pKarat').value = '22';
  $('pGrams').value = '';
  $('pPrice').value = '';
  $('pJeweller').value = '';
  $('pNotes').value = '';
  $('addPurchaseBtn').textContent = 'Add purchase';
  $('cancelEditBtn').style.display = 'none';
  const title = $('purchaseSheetTitle');
  if (title) title.textContent = 'Add purchase';
}

/* ---------- ADD PURCHASE — bottom sheet (Increment 3) ----------
   Was an inline expanding form (Increment 2); same fields, same validation,
   same submit logic — only the container changed, to an overlay sheet that
   can be triggered from Home as well as from Portfolio's "+ Add" button. */

function openPurchaseForm() {
  $('purchaseFormWrap').classList.add('open');
  $('purchaseSheetBackdrop').classList.add('open');
  $('togglePurchaseForm').textContent = '− Close';
}
function closePurchaseForm() {
  $('purchaseFormWrap').classList.remove('open');
  $('purchaseSheetBackdrop').classList.remove('open');
  $('togglePurchaseForm').textContent = '+ Add';
}
function togglePurchaseForm() {
  const isOpen = $('purchaseFormWrap').classList.contains('open');
  if (isOpen) { resetPurchaseForm(); closePurchaseForm(); } else { openPurchaseForm(); }
}

/** Entry point for the Home "Add Purchase" CTA — opens the sheet directly,
 *  regardless of which tab is currently active, since the sheet is a
 *  global overlay rather than something scoped to the Portfolio tab. */
function openAddPurchaseSheet() {
  resetPurchaseForm();
  openPurchaseForm();
  setTimeout(() => $('pGrams')?.focus(), 250);
}

function openGoalForm() {
  $('goalFormWrap').style.display = '';
  $('toggleGoalForm').textContent = '− Close';
}
function closeGoalForm() {
  $('goalFormWrap').style.display = 'none';
  $('toggleGoalForm').textContent = '+ Add';
}
function toggleGoalForm() {
  const isOpen = $('goalFormWrap').style.display !== 'none';
  isOpen ? closeGoalForm() : openGoalForm();
}

function openCustomAlertForm() {
  $('customAlertWrap').style.display = '';
  $('toggleCustomAlert').textContent = '− Close custom alert';
}
function closeCustomAlertForm() {
  $('customAlertWrap').style.display = 'none';
  $('toggleCustomAlert').textContent = '+ Custom alert';
}
function toggleCustomAlertForm() {
  const isOpen = $('customAlertWrap').style.display !== 'none';
  isOpen ? closeCustomAlertForm() : openCustomAlertForm();
}

function wireCollapsibleForms() {
  $('togglePurchaseForm').addEventListener('click', togglePurchaseForm);
  $('toggleGoalForm').addEventListener('click', toggleGoalForm);
  $('toggleCustomAlert').addEventListener('click', toggleCustomAlertForm);

  // Purchase sheet also closes via its own ✕ button or a tap on the backdrop.
  $('purchaseSheetClose').addEventListener('click', () => { resetPurchaseForm(); closePurchaseForm(); });
  $('purchaseSheetBackdrop').addEventListener('click', () => { resetPurchaseForm(); closePurchaseForm(); });

  // Start closed — the list/summary is the default view, the form is an action.
  closePurchaseForm();
  closeGoalForm();
  closeCustomAlertForm();
}

/* ---------- ALERTS ---------- */

function populateGoalAlertDropdown() {
  const sel = $('alertGoalSelect');
  if (!sel) return;
  const goals = getGoals();
  sel.innerHTML = goals.map(g => `<option value="${g.id}">${g.name}</option>`).join('')
    || `<option value="">No goals yet</option>`;
}

/** Surfaces the same "will I actually get notified" facts that previously only
 *  lived in a footer disclaimer — right where the trust question actually
 *  arises (the Alerts tab), not three taps away in More. No new data: reuses
 *  Notification.permission, lastResult.timestamp, and a static caveat line. */
function renderNotificationHealth() {
  const el = $('notifHealthCard');
  if (!el) return;

  const notifOn = Settings.get('notif', '0') === '1';
  const permGranted = ('Notification' in window) && Notification.permission === 'granted';
  const statusText = notifOn && permGranted ? 'On' : (notifOn && !permGranted ? 'Blocked at browser level' : 'Off');
  const statusClass = notifOn && permGranted ? 'positive' : (notifOn ? 'negative' : '');

  const mins = minutesSinceLastUpdate();
  const lastCheckText = mins === null ? 'Never checked yet'
    : (mins < 1 ? 'Just now' : mins < 60 ? `${Math.round(mins)}m ago` : `${Math.round(mins / 60)}h ago`);

  el.innerHTML = `
    <div class="cmp-row"><span>Notifications</span><span class="cmp-val ${statusClass}">${statusText}</span></div>
    <div class="cmp-row"><span>Last check</span><span class="cmp-val">${lastCheckText}</span></div>
    <div class="subnote" style="margin-top:8px;">Alerts fire while this app is open or recently backgrounded — same as any browser tab, not a guaranteed push. See More → Settings for details.</div>
  `;
}

function renderAlerts() {
  const alerts = getAlerts();
  const el = $('alertsList');
  if (!alerts.length) {
    el.innerHTML = `<div class="subnote">No alerts set up yet — add one above.</div>`;
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div class="cmp-row">
      <span>
        <label class="switch" style="vertical-align:middle; margin-right:8px;">
          <input type="checkbox" class="alert-toggle" data-id="${a.id}" ${a.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        ${alertLabel(a)}
      </span>
      <span class="del" data-id="${a.id}" style="color:var(--red); cursor:pointer;">✕</span>
    </div>
  `).join('');

  el.querySelectorAll('.alert-toggle').forEach(chk => {
    chk.addEventListener('change', () => {
      const alerts = getAlerts();
      const a = alerts.find(x => x.id === chk.dataset.id);
      if (a) { a.enabled = chk.checked; saveAlerts(alerts); }
    });
  });
  el.querySelectorAll('.del').forEach(btn => {
    btn.addEventListener('click', () => {
      saveAlerts(getAlerts().filter(a => a.id !== btn.dataset.id)); // emits 'alerts:changed' -> renderAlerts
    });
  });
}

/* ---------- TREND / SPARKLINE ---------- */

function renderTrend(hist) {
  if (!hist.length) return;
  const cache = Settings.getJSON('trendCache', null);
  const hasBackfill = !!(cache && cache.points && cache.points.length);
  const spanDays = hist.length > 1 ? Math.max(1, Math.round((hist[hist.length - 1].t - hist[0].t) / 86400000)) : 0;
  $('trendDays').textContent = spanDays > 0
    ? (hasBackfill ? `${spanDays}-day history (gold-api.com + live)` : `${spanDays}-day history (${hist.length} checks)`)
    : 'building history...';

  const points = hist.slice(-90);
  const svg = $('sparkline');
  if (points.length < 2) {
    svg.innerHTML = `<text x="150" y="34" text-anchor="middle" fill="#666" font-size="11">Collecting data — check back after a few checks</text>`;
    return;
  }
  const vals = points.map(p => p.usd);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const w = 300, h = 60, pad = 4;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.usd - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  svg.innerHTML = `<polyline points="${coords}" fill="none" stroke="#d4af37" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
}

/* ---------- INDIA VS SAUDI COMPARISON ---------- */

function renderComparison() {
  if (!lastResult || !lastResult.prices.INR || !lastResult.prices.SAR) return;
  const inr = lastResult.prices.INR;
  const sar = lastResult.prices.SAR;
  const sarToInr = inr.spot24 / sar.spot24;
  const saudiInInr = sar.prem22 * sarToInr;

  $('cmpIndia').textContent = money('INR', inr.prem22);
  $('cmpSaudi').textContent = money('INR', saudiInInr);
  const diffPct = ((inr.prem22 - saudiInInr) / saudiInInr) * 100;
  $('cmpResult').textContent = Math.abs(diffPct) < 0.5
    ? 'Roughly the same in both markets right now'
    : (diffPct > 0 ? `Saudi is ~${diffPct.toFixed(1)}% cheaper right now` : `India is ~${Math.abs(diffPct).toFixed(1)}% cheaper right now`);

  const mini = $('dashCmpMini');
  if (mini) {
    mini.textContent = Math.abs(diffPct) < 0.5 ? 'Same' : (diffPct > 0 ? `Saudi −${diffPct.toFixed(1)}%` : `India −${Math.abs(diffPct).toFixed(1)}%`);
  }

  const teaser = $('cmpTeaserText');
  if (teaser) {
    teaser.textContent = Math.abs(diffPct) < 0.5
      ? `India and Saudi are roughly the same right now (${money('INR', inr.prem22)}/g, 22K).`
      : (diffPct > 0
        ? `Saudi is ~${diffPct.toFixed(1)}% cheaper than India right now (22K).`
        : `India is ~${Math.abs(diffPct).toFixed(1)}% cheaper than Saudi right now (22K).`);
  }

  const methodology = $('trustMethodologyText');
  if (methodology) {
    methodology.textContent = `Spot price plus India's ${getPremiumPctFor('INR')}% and Saudi's ${getPremiumPctFor('SAR')}% premiums (editable in Settings), converted at today's exchange rate. Doesn't account for your actual remittance rate or transfer fees.`;
  }
}

/* ---------- RECENT CHECKS LOG ---------- */

function renderLog() {
  const log = Settings.getJSON('log', []);
  const el = $('logList');
  if (!log.length) { el.innerHTML = '<div class="log-entry"><span>No checks yet</span></div>'; return; }
  const primary = getPrimaryCurrency();
  el.innerHTML = log.map(r => {
    const p = r.prices ? r.prices[primary] : null;
    return `
      <div class="log-entry">
        <span>${new Date(r.timestamp).toLocaleString()}</span>
        <span>24K ${p ? money(primary, p.prem24) : '--'}</span>
      </div>
    `;
  }).join('');
}

/* ============================================================================
   SCHEDULING (in-page timer — see implementation notes on background limits)
   ============================================================================ */

let intervalHandle = null;
let countdownHandle = null;
let nextCheckTime = null;

function scheduleNext() {
  clearInterval(intervalHandle);
  clearInterval(countdownHandle);
  const minutes = Settings.getNum('interval', 120);
  const ms = minutes * 60 * 1000;
  nextCheckTime = Date.now() + ms;
  intervalHandle = setInterval(() => {
    fetchGoldPrice();
    nextCheckTime = Date.now() + ms;
  }, ms);
  countdownHandle = setInterval(() => {
    updateCountdown();
    renderLastUpdated(); // keeps "Updated Xm ago" and stale banner ticking live
  }, 1000);
}

function updateCountdown() {
  if (!nextCheckTime) return;
  const diff = Math.max(0, nextCheckTime - Date.now());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const el = $('nextCheck');
  if (el) el.textContent = `${h}h ${m}m ${s}s`;
}

/* ============================================================================
   NAVIGATION — 4-tab shell (Home / Portfolio / Alerts / More)
   ============================================================================ */

const TABS = ['home', 'portfolio', 'alerts', 'more'];

function goToTab(tab, focusForm) {
  TABS.forEach(t => {
    const panel = $('tab-' + t);
    if (panel) panel.style.display = (t === tab) ? '' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  if (tab === 'alerts') {
    Settings.set('alertsSeen', '1');
    updateAlertsBadge();
  }

  if (focusForm) {
    // Quick-action buttons on Home ("Add Purchase" / "Set Alert") jump straight to the form
    setTimeout(() => {
      if (tab === 'portfolio') $('pGrams')?.focus();
      if (tab === 'alerts') $('alertType')?.focus();
    }, 50);
  }
}

function updateAlertsBadge() {
  const badge = $('alertsBadge');
  if (!badge) return;
  const hasUnseen = Settings.get('alertsSeen', '1') !== '1';
  badge.style.display = hasUnseen ? 'inline-block' : 'none';
}

/* ============================================================================
   QUICK CALCULATOR (Home tab)
   ============================================================================ */

function wireQuickCalculator() {
  const update = () => {
    const grams = parseFloat($('calcGrams').value);
    const karat = Number($('calcKarat').value);
    const currency = getPrimaryCurrency();
    const el = $('calcResult');
    if (!grams || grams <= 0) {
      el.textContent = "Enter a weight to see today's value";
      return;
    }
    const price = currentPrice(currency, karat);
    if (price === null) {
      el.textContent = 'Price not loaded yet — check your connection.';
      return;
    }
    const making = 1 + getMakingChargePct() / 100;
    el.innerHTML = `${fmt(grams)}g of ${karat}K ≈ <strong>${money(currency, grams * price)}</strong> at spot-adjusted local price, <strong>${money(currency, grams * price * making)}</strong> incl. typical making charge.`;
  };
  $('calcGrams').addEventListener('input', update);
  $('calcKarat').addEventListener('change', update);
}

/* ============================================================================
   ALERT PRESETS (Alerts tab)
   ============================================================================ */

function applyAlertPreset(name) {
  goToTab('alerts');
  const alerts = getAlerts();
  const primary = getPrimaryCurrency();

  if (name === 'dip3' || name === 'dip5') {
    alerts.push({
      id: uid(), type: 'drop_vs_avg', currency: primary, karat: 24,
      thresholdPct: name === 'dip3' ? 3 : 5, enabled: true, lastTriggered: null
    });
    saveAlerts(alerts); // emits 'alerts:changed' -> renderAlerts
  } else if (name === 'milestones') {
    const goals = getGoals();
    if (!goals.length) {
      alert('Add a goal first (Portfolio tab) — milestone alerts need a goal to track.');
      return;
    }
    [25, 50, 75, 100].forEach(pct => {
      alerts.push({
        id: uid(), type: 'goal_milestone', goalId: goals[0].id, milestonePct: pct,
        enabled: true, lastTriggered: null, triggeredMilestones: []
      });
    });
    saveAlerts(alerts); // emits 'alerts:changed' -> renderAlerts
  }
}

/* ============================================================================
   SERVICE WORKER
   ============================================================================ */

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    console.error('SW registration failed', e);
  }
}

/* ============================================================================
   EVENT WIRING
   ============================================================================ */

function wireSettingsForm() {
  $('intervalSelect').addEventListener('change', (e) => {
    Settings.setNum('interval', parseInt(e.target.value, 10));
    scheduleNext();
  });
  $('weightSelect').addEventListener('change', (e) => {
    Settings.setNum('weight', parseFloat(e.target.value));
    if (lastResult) renderPriceCards();
  });
  $('primaryCurrencySelect').addEventListener('change', (e) => {
    Settings.set('primaryCurrency', e.target.value);
    renderAll();
  });
  $('inrPremium').addEventListener('change', (e) => {
    Settings.setNum('inrPremium', parseFloat(e.target.value) || 0);
    fetchGoldPrice();
  });
  $('sarPremium').addEventListener('change', (e) => {
    Settings.setNum('sarPremium', parseFloat(e.target.value) || 0);
    fetchGoldPrice();
  });
  $('otherPremium').addEventListener('change', (e) => {
    Settings.setNum('otherPremium', parseFloat(e.target.value) || 0);
    fetchGoldPrice();
  });
  $('makingCharge').addEventListener('change', (e) => {
    Settings.setNum('makingCharge', parseFloat(e.target.value) || 0);
    if (lastResult) { renderPriceCards(); renderGoals(); }
  });

  $('notifToggle').addEventListener('change', async (e) => {
    if (e.target.checked) {
      if (!('Notification' in window)) { alert('This browser does not support notifications.'); e.target.checked = false; return; }
      let granted = Notification.permission === 'granted';
      if (!granted && Notification.permission !== 'denied') {
        granted = (await Notification.requestPermission()) === 'granted';
      }
      if (!granted) {
        e.target.checked = false;
        $('permWarn').style.display = 'block';
        return;
      }
      $('permWarn').style.display = 'none';
    }
    Settings.set('notif', e.target.checked ? '1' : '0');
    renderNotificationHealth();
  });
}

function populatePrimaryCurrencyOptions() {
  const sel = $('primaryCurrencySelect');
  const selected = getSelectedCurrencies();
  const options = CURRENCIES.filter(c => selected.includes(c.code));
  sel.innerHTML = options.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
  sel.value = getPrimaryCurrency();
}

function wirePurchaseForm() {
  $('addPurchaseBtn').addEventListener('click', () => {
    const date = $('pDate').value || new Date().toISOString().slice(0, 10);
    const karat = Number($('pKarat').value);
    const grams = parseFloat($('pGrams').value);
    const price = parseFloat($('pPrice').value);
    const currency = $('pCurrency').value;
    const jeweller = $('pJeweller').value.trim();
    const notes = $('pNotes').value.trim();

    if (!grams || grams <= 0 || !price || price <= 0) {
      alert('Enter both weight and price paid.');
      return;
    }

    const purchases = getPurchases();
    if (editingPurchaseId) {
      const idx = purchases.findIndex(p => p.id === editingPurchaseId);
      if (idx > -1) purchases[idx] = { id: editingPurchaseId, date, karat, grams, price, currency, jeweller, notes };
    } else {
      purchases.push({ id: uid(), date, karat, grams, price, currency, jeweller, notes });
    }
    savePurchases(purchases); // emits 'purchases:changed' -> renderPurchases, renderPortfolio, renderGoals, renderDashboard, renderAllocationBar
    resetPurchaseForm();
    closePurchaseForm();
  });

  $('cancelEditBtn').addEventListener('click', () => {
    resetPurchaseForm();
    closePurchaseForm();
  });
}

function wireGoalForm() {
  $('addGoalBtn').addEventListener('click', () => {
    const name = $('goalName').value.trim() || 'Gold goal';
    const targetGrams = parseFloat($('goalGrams').value);
    const karatFilter = $('goalKarat').value === 'any' ? 'any' : Number($('goalKarat').value);
    if (!targetGrams || targetGrams <= 0) { alert('Enter a target weight in grams.'); return; }

    const goals = getGoals();
    goals.push({ id: uid(), name, targetGrams, karatFilter, createdAt: Date.now() });
    saveGoals(goals); // emits 'goals:changed' -> renderGoals, renderDashboard, populateGoalAlertDropdown

    $('goalName').value = ''; $('goalGrams').value = '';
    closeGoalForm();
  });
}

function wireAlertForm() {
  const typeSelect = $('alertType');

  // Populate currency dropdowns used by the alert form
  const currencyOptionsHtml = CURRENCIES.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
  $('alertCurrencyThreshold').innerHTML = currencyOptionsHtml;
  $('alertCurrencyTarget').innerHTML = currencyOptionsHtml;

  function updateAlertFormVisibility() {
    const type = typeSelect.value;
    $('alertFieldsThreshold').style.display = (type === 'drop_vs_avg') ? 'block' : 'none';
    $('alertFieldsTarget').style.display = (type === 'price_target') ? 'block' : 'none';
    $('alertFieldsGoal').style.display = (type === 'goal_milestone') ? 'block' : 'none';
  }
  typeSelect.addEventListener('change', updateAlertFormVisibility);
  updateAlertFormVisibility();

  $('addAlertBtn').addEventListener('click', () => {
    const type = typeSelect.value;
    const alerts = getAlerts();
    let alert = { id: uid(), type, enabled: true, lastTriggered: null };

    if (type === 'drop_vs_avg') {
      alert.currency = $('alertCurrencyThreshold').value;
      alert.karat = Number($('alertKaratThreshold').value);
      alert.thresholdPct = parseFloat($('alertThresholdPct').value) || 3;
    } else if (type === 'price_target') {
      alert.currency = $('alertCurrencyTarget').value;
      alert.karat = Number($('alertKaratTarget').value);
      alert.direction = $('alertDirection').value;
      alert.thresholdValue = parseFloat($('alertThresholdValue').value);
      if (!alert.thresholdValue) { alert('Enter a target price.'); return; }
    } else if (type === 'goal_milestone') {
      alert.goalId = $('alertGoalSelect').value;
      alert.milestonePct = parseFloat($('alertMilestonePct').value);
      alert.triggeredMilestones = [];
      if (!alert.goalId) { alert('Add a goal first.'); return; }
    }

    alerts.push(alert);
    saveAlerts(alerts); // emits 'alerts:changed' -> renderAlerts
    closeCustomAlertForm();
  });
}

function wireBackup() {
  $('exportBtn').addEventListener('click', () => {
    const data = {};
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('goldtracker_')) data[k] = localStorage.getItem(k);
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gold-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        Object.keys(data).forEach(k => {
          if (k.startsWith('goldtracker_')) localStorage.setItem(k, data[k]);
        });
        alert('Data restored. Reloading...');
        location.reload();
      } catch (err) {
        alert("Could not read that file — make sure it's a backup exported from this app.");
      }
    };
    reader.readAsText(file);
  });

  $('forceRefreshBtn').addEventListener('click', async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      console.error('Force refresh cleanup failed', e);
    }
    location.reload(true);
  });
}

/* ----------------------------------------------------------------------------
   EMPTY STATE CTAs (Increment 3) — the two that live as static markup in
   index.html rather than being generated inside a render*() innerHTML call.
---------------------------------------------------------------------------- */

function wireEmptyStates() {
  $('dashEmptyCta')?.addEventListener('click', openAddPurchaseSheet);
  $('purchasesEmptyCta')?.addEventListener('click', openAddPurchaseSheet);
}

/* ----------------------------------------------------------------------------
   PERSONA & HOME REORDERING (Increment 4)
   A single localStorage flag reorders the same four existing Home blocks —
   no new data, no per-persona content. Empty string means "not chosen yet",
   which both triggers the onboarding overlay and falls back to the buyer
   order (the most neutral of the three) for anyone who dismisses it.
---------------------------------------------------------------------------- */

const PERSONA_ORDER = {
  buyer:    { buySignalCard: 0, cmpTeaserSection: 1, portfolioBlock: 2, landedCostCard: 3 },
  investor: { buySignalCard: 0, portfolioBlock: 1, cmpTeaserSection: 2, landedCostCard: 3 },
  nri:      { cmpTeaserSection: 0, landedCostCard: 1, buySignalCard: 2, portfolioBlock: 3 }
};

function getPersona() {
  return Settings.get('persona', '');
}

function applyPersonaOrder() {
  const orderMap = PERSONA_ORDER[getPersona()] || PERSONA_ORDER.buyer;
  Object.keys(orderMap).forEach(id => {
    const el = $(id);
    if (el) el.style.order = orderMap[id];
  });
}

function openPersonaOnboarding() {
  $('personaOverlay').classList.add('open');
  document.querySelectorAll('.persona-card').forEach(card => {
    card.classList.toggle('active', card.dataset.persona === getPersona());
  });
}
function closePersonaOnboarding() {
  $('personaOverlay').classList.remove('open');
}

function setPersona(persona) {
  Settings.set('persona', persona);
  applyPersonaOrder();
  closePersonaOnboarding();
}

function wirePersonaOnboarding() {
  document.querySelectorAll('.persona-card').forEach(card => {
    card.addEventListener('click', () => setPersona(card.dataset.persona));
  });
  $('personaCloseX').addEventListener('click', closePersonaOnboarding);
  $('changePersonaBtn').addEventListener('click', openPersonaOnboarding);

  if (!getPersona()) openPersonaOnboarding();
}

/* ----------------------------------------------------------------------------
   LANDED COST (NRI) (Increment 4)
   Deliberately minimal for Phase 1 — one active trip's duty-free allowance
   vs. grams brought so far, not a full trip ledger (that's NRI Pro territory,
   out of scope here). New key, additive — doesn't touch the v3 schema.
---------------------------------------------------------------------------- */

function getTrip() {
  return Settings.getJSON('trip', null);
}
function saveTrip(trip) {
  Settings.set('trip', trip);
  renderLandedCost();
}

function renderLandedCost() {
  const trip = getTrip();
  const homeBody = $('landedCostHomeBody');
  const portfolioBody = $('landedCostBody');
  if (!homeBody || !portfolioBody) return;

  if (!trip || !trip.allowanceGrams) {
    homeBody.innerHTML = `
      <div class="empty-state empty-state-inline">
        <div class="empty-state-msg">Bringing gold home? Track your duty-free allowance across the trip.</div>
        <button class="btn primary-btn empty-state-cta" id="landedCostHomeCta">Set up your first trip</button>
      </div>
    `;
    $('landedCostHomeCta').addEventListener('click', openLandedCostFromHome);
    portfolioBody.innerHTML = `<div class="subnote">No trip set up yet — tap Edit to add your allowance and what you're bringing.</div>`;
    return;
  }

  const pct = Math.min(100, (trip.gramsBrought / trip.allowanceGrams) * 100);
  const remaining = Math.max(0, trip.allowanceGrams - trip.gramsBrought);
  const summaryHtml = `
    <div class="landed-progress-label"><span>Allowance used</span><span>${fmt(trip.gramsBrought)}g of ${fmt(trip.allowanceGrams)}g</span></div>
    <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%;"></div></div>
    <div class="subnote" style="margin-top:8px;">${remaining > 0 ? `${fmt(remaining)}g of allowance remaining.` : 'Allowance fully used — anything more may attract customs duty.'}</div>
  `;
  homeBody.innerHTML = `<div class="dash-label" style="margin-bottom:8px;">Landed cost (NRI)</div>` + summaryHtml;
  portfolioBody.innerHTML = summaryHtml;
}

function openLandedCostForm() {
  const trip = getTrip();
  $('lcAllowance').value = trip ? trip.allowanceGrams : '';
  $('lcGramsBrought').value = trip ? trip.gramsBrought : '';
  $('landedCostFormWrap').style.display = '';
  $('toggleLandedCostForm').textContent = '− Close';
}
function closeLandedCostForm() {
  $('landedCostFormWrap').style.display = 'none';
  $('toggleLandedCostForm').textContent = 'Edit';
}
function toggleLandedCostForm() {
  const isOpen = $('landedCostFormWrap').style.display !== 'none';
  if (isOpen) closeLandedCostForm(); else openLandedCostForm();
}

function openLandedCostFromHome() {
  goToTab('portfolio');
  setTimeout(() => {
    openLandedCostForm();
    $('lcAllowance')?.focus();
  }, 60);
}

function wireLandedCostForm() {
  $('toggleLandedCostForm').addEventListener('click', toggleLandedCostForm);
  $('saveLandedCostBtn').addEventListener('click', () => {
    const allowanceGrams = parseFloat($('lcAllowance').value);
    const gramsBrought = parseFloat($('lcGramsBrought').value) || 0;
    if (!allowanceGrams || allowanceGrams <= 0) { $('lcAllowance').focus(); return; }
    saveTrip({ allowanceGrams, gramsBrought, updatedAt: Date.now() });
    closeLandedCostForm();
  });
  closeLandedCostForm();
}

/* ============================================================================
   INIT
   ============================================================================ */

function loadSettingsIntoForm() {
  $('intervalSelect').value = Settings.get('interval', '120');
  $('weightSelect').value = Settings.get('weight', '10');
  $('inrPremium').value = Settings.get('inrPremium', '14');
  $('sarPremium').value = Settings.get('sarPremium', '4');
  $('otherPremium').value = Settings.get('otherPremium', '0');
  $('makingCharge').value = Settings.get('makingCharge', '12');
  $('notifToggle').checked = Settings.get('notif', '0') === '1' && (('Notification' in window) && Notification.permission === 'granted');
  if (Settings.get('notif', '0') === '1' && (!('Notification' in window) || Notification.permission !== 'granted')) {
    $('permWarn').style.display = 'block';
  }
}

(function init() {
  runMigration();
  registerServiceWorker();

  const cachedLast = Settings.getJSON('last', null);
  if (cachedLast) lastResult = cachedLast;

  loadSettingsIntoForm();
  renderCurrencyChips();
  renderKaratChips();
  populatePrimaryCurrencyOptions();
  populatePCurrencyOptions();
  resetPurchaseForm();
  populateGoalAlertDropdown();

  // Store subscriptions — single canonical place that decides what re-renders
  // when purchases/goals/alerts change, instead of each mutation site
  // remembering its own list of render calls.
  Store.on('purchases:changed', () => {
    renderPurchases(); renderPortfolio(); renderAllocationBar(); renderGoals(); renderDashboard();
  });
  Store.on('goals:changed', () => {
    renderGoals(); renderDashboard(); populateGoalAlertDropdown();
  });
  Store.on('alerts:changed', () => {
    renderAlerts();
  });

  wireSettingsForm();
  wirePurchaseForm();
  wireGoalForm();
  wireAlertForm();
  wireBackup();
  wireQuickCalculator();
  wireCollapsibleForms();
  wireEmptyStates();
  wirePersonaOnboarding();
  wireLandedCostForm();
  applyPersonaOrder();
  renderLandedCost();
  updateAlertsBadge();

  if (lastResult) renderAll();

  fetchGoldPrice();
  scheduleNext();

  // Trend backfill (Increment 5) — fire-and-forget, cached for 24h. Runs
  // after the first render so the app is usable immediately; once it
  // resolves, re-render the views that read merged history so the "authentic"
  // 90-day trend/Buy Signal appear without waiting for a reload.
  fetchTrendBackfill().then(() => {
    renderTrend(getMergedHistory());
    renderBuySignal();
  });
})();
