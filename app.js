/* ============================================================================
   GOLD PRICE TRACKER — Phase 1
   Static, client-only, localStorage-persisted. No backend.
   ============================================================================ */

const GRAMS_PER_OZ = 31.1034768;
const SCHEMA_VERSION = 2;
const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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
   MIGRATION — upgrades data from the pre-Phase-1 single-file version.
   Old keys (schema v1, implicit / unversioned):
     goldtracker_purchases : [{date, karat, grams, price, currency, jeweller}]
     goldtracker_goal      : {name, grams}
     goldtracker_buyThreshold : "3"
     goldtracker_currencies, _inrPremium, _sarPremium, _otherPremium,
     _makingCharge, _weight, _interval, _notif, _last, _log, _history — unchanged, reused as-is.
   New keys (schema v2):
     goldtracker_purchases_v2 : [{id, date, karat, grams, price, currency, jeweller, notes}]
     goldtracker_goals_v2     : [{id, name, targetGrams, karatFilter, createdAt}]
     goldtracker_alerts_v2    : [{id, type, currency, karat, direction, thresholdValue,
                                   thresholdPct, milestonePct, goalId, enabled,
                                   lastTriggered, triggeredMilestones}]
     goldtracker_primaryCurrency : "INR"
     goldtracker_schema_version  : 2
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
    const usd22 = usd24 * (22 / 24);

    const prices = {};
    CURRENCIES.forEach(c => {
      const rate = fxData.rates[c.code];
      if (!rate) return;
      const premium = 1 + getPremiumPctFor(c.code) / 100;
      prices[c.code] = {
        rate,
        spot24: usd24 * rate,
        spot22: usd22 * rate,
        prem24: usd24 * rate * premium,
        prem22: usd22 * rate * premium
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

/** Current premium (local-market) price per gram for a given currency + karat ('22'|'24') */
function currentPrice(currency, karat) {
  if (!lastResult || !lastResult.prices[currency]) return null;
  return karat === '22' ? lastResult.prices[currency].prem22 : lastResult.prices[currency].prem24;
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

  const karatForPrice = goal.karatFilter === 'any' ? '22' : goal.karatFilter;
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
  const hist = Settings.getJSON('history', []);
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
        const curSpot = a.karat === '22' ? p.spot22 : p.spot24;
        const usdEquivalent = snapshot.usdPerOz; // compare in USD terms, currency-agnostic
        const dropPct = ((avg - usdEquivalent) / avg) * 100;
        if (dropPct >= a.thresholdPct) {
          isTriggered = true;
          message = `Gold is ${dropPct.toFixed(1)}% below its 30-day average. ${a.currency} ${a.karat}K ≈ ${money(a.currency, a.karat === '22' ? p.prem22 : p.prem24)}/g.`;
        }
      }
    }

    if (a.type === 'price_target') {
      const p = snapshot.prices[a.currency];
      if (p) {
        const cur = a.karat === '22' ? p.prem22 : p.prem24;
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
  renderPriceCards();
  renderCurrencyChips();
  renderPortfolio();
  renderGoals();
  renderPurchases();
  renderAlerts();
  renderTrend(Settings.getJSON('history', []));
  renderComparison();
  renderLog();
  renderLastUpdated();
}

/* ---------- DASHBOARD ---------- */

function renderDashboard() {
  const primary = getPrimaryCurrency();

  if (!lastResult) {
    $('dashPrice24').textContent = '--';
    $('dashPrice22').textContent = '--';
    $('dashPortfolioValue').textContent = '--';
    $('dashGainLoss').textContent = '--';
    $('dashGrams').textContent = '--';
    return;
  }

  const p = lastResult.prices[primary];
  if (p) {
    $('dashPrice24').textContent = money(primary, p.prem24);
    $('dashPrice22').textContent = money(primary, p.prem22);
  }

  const headline = computePortfolioHeadline(primary);
  $('dashGrams').textContent = fmt(totalGramsOwned()) + ' g';

  if (headline.totalInvested > 0) {
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
    $('dashPortfolioValue').textContent = 'No purchases logged yet';
    $('dashGainLoss').textContent = '';
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

/* ---------- PRICE CARDS (multi-currency grid) ---------- */

function renderPriceCards() {
  if (!lastResult) return;
  $('spotUsd').textContent = '$' + fmt(lastResult.usdPerOz);

  const weight = getWeightGrams();
  const weightLabel = weight === 1 ? 'per gram' : (weight === 11.664 ? 'per tola' : `for ${weight}g`);
  const making = 1 + getMakingChargePct() / 100;
  const selected = getSelectedCurrencies();
  const grid = $('priceCardsGrid');

  if (!selected.length) {
    grid.innerHTML = `<div class="card full-card"><div class="subnote">Pick at least one currency in Settings below.</div></div>`;
  } else {
    let html = '';
    selected.forEach(code => {
      const p = lastResult.prices[code];
      if (!p) return;
      const meta = currencyMeta(code);
      const sym = meta.symbol;
      html += `
        <div class="card">
          <div class="karat">24K GOLD</div>
          <div class="currency-label">${code} ${weightLabel}</div>
          <div class="amount">${sym}${fmt(p.prem24 * weight)}</div>
          <div class="unit">spot: ${sym}${fmt(p.spot24)}/g · jeweller ≈ ${sym}${fmt(p.prem24 * weight * making)}</div>
        </div>
        <div class="card">
          <div class="karat">22K GOLD</div>
          <div class="currency-label">${code} ${weightLabel}</div>
          <div class="amount">${sym}${fmt(p.prem22 * weight)}</div>
          <div class="unit">spot: ${sym}${fmt(p.spot22)}/g · jeweller ≈ ${sym}${fmt(p.prem22 * weight * making)}</div>
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  const topLine = selected
    .filter(code => lastResult.prices[code])
    .map(code => { const m = currencyMeta(code); return `${m.symbol}${fmt(lastResult.prices[code].spot24)}`; })
    .join(' / ');
  $('spotTopLine').textContent = topLine ? `≈ ${topLine} per gram (24K spot)` : '--';
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
  const groups = computePortfolio();
  const el = $('portfolioBody');
  if (!groups.length) {
    el.innerHTML = `<div class="subnote">No purchases logged yet — add one in "My Purchases" below and this fills in automatically.</div>`;
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

/* ---------- GOALS ---------- */

function renderGoals() {
  const goals = getGoals();
  const el = $('goalsList');
  if (!goals.length) {
    el.innerHTML = `<div class="subnote">No goals yet — add one above.</div>`;
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
      saveGoals(remaining);
      renderGoals();
      renderDashboard();
      populateGoalAlertDropdown();
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
  const purchases = getPurchases();
  const tbody = $('purchaseTbody');
  const table = $('purchaseTable');

  if (!purchases.length) {
    table.style.display = 'none';
    return;
  }
  table.style.display = '';

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
      savePurchases(remaining);
      renderPurchases();
      renderPortfolio();
      renderGoals();
      renderDashboard();
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
      window.scrollTo({ top: $('purchasesSection').offsetTop - 10, behavior: 'smooth' });
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
}

/* ---------- ALERTS ---------- */

function populateGoalAlertDropdown() {
  const sel = $('alertGoalSelect');
  if (!sel) return;
  const goals = getGoals();
  sel.innerHTML = goals.map(g => `<option value="${g.id}">${g.name}</option>`).join('')
    || `<option value="">No goals yet</option>`;
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
      saveAlerts(getAlerts().filter(a => a.id !== btn.dataset.id));
      renderAlerts();
    });
  });
}

/* ---------- TREND / SPARKLINE ---------- */

function renderTrend(hist) {
  if (!hist.length) return;
  const spanDays = hist.length > 1 ? Math.max(1, Math.round((hist[hist.length - 1].t - hist[0].t) / 86400000)) : 0;
  $('trendDays').textContent = spanDays > 0 ? `${spanDays}-day history (${hist.length} checks)` : 'building history...';

  const points = hist.slice(-60);
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
    const karat = $('pKarat').value;
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
    savePurchases(purchases);
    resetPurchaseForm();
    renderPurchases();
    renderPortfolio();
    renderGoals();
    renderDashboard();
  });

  $('cancelEditBtn').addEventListener('click', () => {
    resetPurchaseForm();
  });
}

function wireGoalForm() {
  $('addGoalBtn').addEventListener('click', () => {
    const name = $('goalName').value.trim() || 'Gold goal';
    const targetGrams = parseFloat($('goalGrams').value);
    const karatFilter = $('goalKarat').value;
    if (!targetGrams || targetGrams <= 0) { alert('Enter a target weight in grams.'); return; }

    const goals = getGoals();
    goals.push({ id: uid(), name, targetGrams, karatFilter, createdAt: Date.now() });
    saveGoals(goals);

    $('goalName').value = ''; $('goalGrams').value = '';
    renderGoals();
    renderDashboard();
    populateGoalAlertDropdown();
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
      alert.karat = $('alertKaratThreshold').value;
      alert.thresholdPct = parseFloat($('alertThresholdPct').value) || 3;
    } else if (type === 'price_target') {
      alert.currency = $('alertCurrencyTarget').value;
      alert.karat = $('alertKaratTarget').value;
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
    saveAlerts(alerts);
    renderAlerts();
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
  populatePrimaryCurrencyOptions();
  populatePCurrencyOptions();
  resetPurchaseForm();
  populateGoalAlertDropdown();

  wireSettingsForm();
  wirePurchaseForm();
  wireGoalForm();
  wireAlertForm();
  wireBackup();

  if (lastResult) renderAll();

  fetchGoldPrice();
  scheduleNext();
})();
