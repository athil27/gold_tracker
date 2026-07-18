/**
 * Gold Tracker — Price Proxy & Shared Signal Worker
 * =====================================================================
 * Two endpoints:
 *   GET /api/price   Live spot price (USD/oz) + FX rates. Lightly
 *                     edge-cached (30s) to absorb bursts of requests.
 *   GET /api/signal   The full Price Context signal — label, numbers,
 *                     confidence, track record, and the 90-day history
 *                     used to compute it — calculated ONCE here and
 *                     served identically to every device. This is what
 *                     fixes the cross-device consistency bug at its
 *                     root: every browser now reads the same answer
 *                     instead of each approximating its own from
 *                     whatever local check-in history that specific
 *                     device happened to accumulate.
 *
 * The math in the "SIGNAL COMPUTATION" section below is a direct port
 * of app.js's computePriceContext() engine (Increment 7). Behavior is
 * meant to match exactly; only WHERE it runs has changed.
 *
 * RETAIL-PRICE ACCUMULATION & RETAIL CONTEXT SIGNAL: every refresh writes
 * today's 22K retail price (INR and SAR) into a permanent, never-expiring
 * KV record (accumulateRetailHistory()) and computes a second signal from
 * it — same z-score/band/confidence/track-record engine as spot, just fed
 * retail data (computeRetailSignals()) — attached to /api/signal's
 * response as `retail: { INR: {...}, SAR: {...} }`. Always both
 * currencies, regardless of any user's primary-currency setting: this
 * data exists for cross-border (NRI) comparison, which only makes sense
 * with both visible together. Uses representative default premiums
 * (14% India / 4% Saudi, matching sw.js's background-notification
 * defaults), NOT any individual user's actual settings — the client is
 * responsible for stating that caveat plainly, same as every other
 * "at today's rate" / "using representative assumptions" disclosure
 * already in this app.
 *
 * Requires (see deployment notes for how to set these up):
 *   GOLD_API_KEY   Secret — the gold-api.com key. Lives here now,
 *                  never shipped to the browser.
 *   SIGNAL_KV      KV namespace binding — holds both the cached signal
 *                  (key "signal", 1h TTL) and the accumulating retail
 *                  history (key "retail_history", no TTL — persists
 *                  indefinitely). Same namespace, two keys; no second
 *                  binding needed.
 * =====================================================================
 */

const GRAMS_PER_OZ = 31.1034768;
const TREND_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_TRACK_RECORD_SAMPLE = 5;
const SIGNAL_TTL_SECONDS = 3600; // 1 hour — matches the recommended Cron cadence below

/** Which currencies' retail price to accumulate, and at what premium.
 *  These are representative defaults (matching sw.js's existing
 *  background-notification defaults), NOT any individual user's actual
 *  configured premium — the server has no visibility into per-user
 *  Settings. Whatever eventually surfaces from this data needs to say
 *  so plainly, the same way every other "at today's rate" / "using
 *  representative assumptions" caveat already does elsewhere in the app. */
const RETAIL_TRACK = {
  INR: { premiumPct: 14 },
  SAR: { premiumPct: 4 }
};
const RETAIL_KARAT = 22;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === '/api/price') return await handlePrice();
      if (url.pathname === '/api/signal') return await handleSignal(env);
      return json({ error: 'Not found', path: url.pathname }, 404);
    } catch (err) {
      return json({ error: 'Internal error', detail: String(err && err.message || err) }, 500);
    }
  },

  /** Cron Trigger entry point (recommended, not required — see deploy
   *  notes). Refreshes the cached signal proactively so no single
   *  user's request ever pays the cold-computation cost, and so
   *  gold-api.com's history endpoint is called on a predictable
   *  schedule regardless of traffic. Without this wired up, /api/signal
   *  still works correctly — it just computes fresh (adding ~1-2s) the
   *  first time it's asked for after the cache expires each hour. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshSignal(env));
  }
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extraHeaders }
  });
}

function extractUsdPerOz(priceData) {
  return priceData.price ?? priceData.rate ?? priceData.rates?.XAU ?? priceData.data?.price;
}

/** Exact port of app.js's PURITY_FACTOR table — not karat/24, which would
 *  be close but wrong (24K is 0.999 real-world purity, not 1.0 exactly). */
const PURITY_FACTOR = { 18: 0.750, 21: 0.875, 22: 0.9167, 24: 0.999 };
function purityRatio(karat) {
  return PURITY_FACTOR[Number(karat)] ?? PURITY_FACTOR[22];
}

/* =====================================================================
   /api/price
===================================================================== */
async function handlePrice() {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/price');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const [priceRes, fxRes] = await Promise.all([
    fetch('https://api.gold-api.com/price/XAU'),
    fetch('https://open.er-api.com/v6/latest/USD')
  ]);
  const priceData = await priceRes.json();
  const fxData = await fxRes.json();

  const usdPerOz = extractUsdPerOz(priceData);
  if (!usdPerOz) return json({ error: 'Unexpected price response shape', raw: priceData }, 502);

  const payload = { usdPerOz, fx: fxData.rates || {}, timestamp: Date.now() };
  const response = json(payload, 200, { 'Cache-Control': 'public, max-age=30' });
  await cache.put(cacheKey, response.clone());
  return response;
}

/* =====================================================================
   /api/signal
===================================================================== */
async function handleSignal(env) {
  const cached = await env.SIGNAL_KV.get('signal', 'json');
  if (cached) return json(cached);
  const fresh = await refreshSignal(env);
  return json(fresh);
}

/* =====================================================================
   RETAIL-PRICE ACCUMULATION (accumulation only — not exposed yet)
===================================================================== */

/** Upserts today's 22K retail price for each tracked currency into a
 *  never-expiring KV record. Overwrites today's entry if called again
 *  later the same day (same "latest reading of the day" convention used
 *  everywhere else in this app), so calling this from every refreshSignal()
 *  — including the lazy on-cache-miss path, not just the Cron tick — is
 *  safe and doesn't create duplicate same-day entries. Failure here is
 *  deliberately non-fatal: a KV write hiccup shouldn't break /api/signal,
 *  which is why this is wrapped separately and just logged, not thrown. */
async function accumulateRetailHistory(env, usdPerOz, fx) {
  try {
    const dateKey = new Date().toISOString().slice(0, 10);
    const t = dateStrToMs(dateKey);
    const usdK = (usdPerOz / GRAMS_PER_OZ) * purityRatio(RETAIL_KARAT);

    const existing = (await env.SIGNAL_KV.get('retail_history', 'json')) || {};

    Object.keys(RETAIL_TRACK).forEach(code => {
      const rate = fx[code];
      if (!rate) return; // FX didn't include this currency today — skip, don't write a bad point
      const price = usdK * rate * (1 + RETAIL_TRACK[code].premiumPct / 100);

      const series = Array.isArray(existing[code]) ? existing[code] : [];
      const todayIdx = series.findIndex(p => p.t === t);
      const point = { t, price: Math.round(price * 100) / 100 };
      if (todayIdx >= 0) series[todayIdx] = point; else series.push(point);
      existing[code] = series.sort((a, b) => a.t - b.t);
    });

    // No expirationTtl — this is meant to persist and grow indefinitely,
    // unlike the "signal" key's 1-hour cache.
    await env.SIGNAL_KV.put('retail_history', JSON.stringify(existing));
    return existing;
  } catch (err) {
    console.error('Retail history accumulation failed (non-fatal):', err);
    return null;
  }
}

/** Retail Context (Increment 16) — a second signal parallel to spot's
 *  Price Context, but comparing today's REPRESENTATIVE retail price
 *  against its own trailing averages, per tracked currency. This is
 *  deliberately NOT a rewritten engine: z-scores and bands are
 *  unit-agnostic (they operate on percentage deltas of whatever series
 *  they're given), so this just maps retail_history's {t, price} points
 *  to the {t, usd} shape computeSignal() already expects and calls the
 *  exact same function spot uses. Zero new math to verify — the only
 *  new code here is the reshaping and the history-stripping below.
 *  `history` is stripped from each currency's result before returning:
 *  retail_history has no TTL and grows forever, and there's no retail
 *  sparkline built yet to justify shipping that whole array in every
 *  /api/signal response, every hour, indefinitely. */
function computeRetailSignals(historyByCurrency) {
  const result = {};
  Object.keys(RETAIL_TRACK).forEach(code => {
    const series = historyByCurrency[code];
    if (!series || !series.length) { result[code] = null; return; }
    const hist = series.map(p => ({ t: p.t, usd: p.price }));
    const currentVal = hist[hist.length - 1].usd;
    const signal = computeSignal(hist, currentVal);
    delete signal.history;
    result[code] = signal;
  });
  return result;
}

async function refreshSignal(env) {
  const history = await fetchHistory(env);
  const priceRes = await fetch('https://api.gold-api.com/price/XAU');
  const priceData = await priceRes.json();
  const currentUsd = extractUsdPerOz(priceData);

  const signal = computeSignal(history, currentUsd);
  signal.computedAt = Date.now();

  // Retail Context (Increment 16): needs the same FX rates the retail
  // accumulation step uses, so fetch once here and feed both — no reason
  // for a third redundant FX fetch alongside /api/price's and this one.
  const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
  const fxData = await fxRes.json();
  const retailHistoryByCurrency = await accumulateRetailHistory(env, currentUsd, fxData.rates || {});
  // Accumulation failure is non-fatal (logged inside accumulateRetailHistory)
  // — retail signal just comes back null per currency, same "unavailable,
  // not a guess" convention the client already uses for spot Price Context.
  signal.retail = retailHistoryByCurrency ? computeRetailSignals(retailHistoryByCurrency) : null;

  await env.SIGNAL_KV.put('signal', JSON.stringify(signal), { expirationTtl: SIGNAL_TTL_SECONDS });

  return signal;
}

/** Confirmed live contract (Increment 6) — GET with symbol/startTimestamp/
 *  endTimestamp/groupBy=day, auth via x-api-key header, response is an
 *  array of { day: "YYYY-MM-DD HH:MM:SS", max_price: "NNNN.NNNNNN" },
 *  most-recent-first. This is the day's HIGH, not a close — noted here
 *  since it's the same caveat that applied client-side. */
async function fetchHistory(env) {
  if (!env.GOLD_API_KEY) {
    throw new Error('GOLD_API_KEY secret is not set on this Worker — check Settings → Variables, exact name "GOLD_API_KEY"');
  }
  const endTimestamp = Math.floor(Date.now() / 1000);
  const startTimestamp = endTimestamp - TREND_DAYS * 24 * 60 * 60;
  const url = `https://api.gold-api.com/history?symbol=XAU&startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&groupBy=day`;
  const res = await fetch(url, { headers: { 'x-api-key': env.GOLD_API_KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`History fetch failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  const data = await res.json();

  const raw = Array.isArray(data) ? data : [];
  const points = raw.map(item => {
    const date = item.day || item.date;
    const price = item.max_price ?? item.price;
    return (date && price != null)
      ? { t: dateStrToMs(String(date).slice(0, 10)), usd: Number(price) }
      : null;
  }).filter(Boolean);

  return collapseToOnePerDay(points);
}

function dateStrToMs(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').getTime();
}

function collapseToOnePerDay(points) {
  const byDay = new Map();
  points.forEach(p => {
    const dayKey = new Date(p.t).toISOString().slice(0, 10);
    const existing = byDay.get(dayKey);
    if (!existing || p.t > existing.t) byDay.set(dayKey, p);
  });
  return Array.from(byDay.values()).sort((a, b) => a.t - b.t);
}

/* =====================================================================
   SIGNAL COMPUTATION — ported directly from app.js's Price Context
   engine (Increment 7). Same math, same thresholds, same track-record
   floor. The only change from the client version: this runs once here
   instead of once per device.
===================================================================== */
function windowPoints(hist, endT, days) {
  const start = endT - days * DAY_MS;
  return hist.filter(p => p.t >= start && p.t < endT);
}

function dailyChanges(points) {
  const changes = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].usd, cur = points[i].usd;
    if (prev) changes.push((cur - prev) / prev * 100);
  }
  return changes;
}

function stddev(arr) {
  if (arr.length < 2) return null;
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function zScoreFor(hist, endT, days, currentUsd) {
  const win = windowPoints(hist, endT, days);
  if (win.length < 3) return null;
  const avg = win.reduce((s, p) => s + p.usd, 0) / win.length;
  const sd = stddev(dailyChanges(win));
  const deltaPct = ((avg - currentUsd) / avg) * 100;
  return { avg, deltaPct, z: (sd && sd > 0) ? deltaPct / sd : null, coverage: win.length };
}

function bandFromZ(z, deltaPct) {
  if (z == null) {
    if (deltaPct > 3) return 'notably_below';
    if (deltaPct > 1.5) return 'mildly_below';
    if (deltaPct < -2) return 'notably_above';
    if (deltaPct < -1) return 'mildly_above';
    return 'typical';
  }
  if (z > 1.5) return 'notably_below';
  if (z > 0.5) return 'mildly_below';
  if (z < -1.5) return 'notably_above';
  if (z < -0.5) return 'mildly_above';
  return 'typical';
}

const BAND_META = {
  notably_below: { label: 'Notably below recent range', cls: 'good' },
  mildly_below:  { label: 'Mildly below recent range',  cls: 'good' },
  typical:       { label: 'Typical range',               cls: 'neutral' },
  mildly_above:  { label: 'Mildly above recent range',   cls: 'bad' },
  notably_above: { label: 'Notably above recent range',  cls: 'bad' },
  mixed:         { label: 'Mixed',                        cls: 'neutral' }
};
const BAND_ORDER = ['notably_below', 'mildly_below', 'typical', 'mildly_above', 'notably_above'];

function combineHorizons(b7, b30) {
  if (!b7 || !b30) return b30 || b7 || 'typical';
  const i7 = BAND_ORDER.indexOf(b7), i30 = BAND_ORDER.indexOf(b30);
  const sameSide = (i7 <= 1 && i30 <= 1) || (i7 >= 3 && i30 >= 3) || (i7 === 2 && i30 === 2);
  if (!sameSide) return 'mixed';
  return Math.abs(i7 - 2) > Math.abs(i30 - 2) ? b7 : b30;
}

function computeConfidenceTier(hist) {
  const daysOfData = windowPoints(hist, Date.now(), 30).length;
  let tier = 'low';
  if (hist.length >= 60 && daysOfData >= 20) tier = 'high';
  else if (daysOfData >= 7) tier = 'medium';
  return { tier, daysOfData };
}

function computeTrackRecord(hist, currentBand) {
  if (currentBand === 'typical' || currentBand === 'mixed') return null;
  const outcomes = [];
  for (let i = 0; i < hist.length; i++) {
    const d = hist[i];
    const z = zScoreFor(hist, d.t, 30, d.usd);
    if (!z) continue;
    if (bandFromZ(z.z, z.deltaPct) !== currentBand) continue;
    const future = hist.find(p => p.t >= d.t + 7 * DAY_MS);
    if (!future) continue;
    outcomes.push(future.usd > d.usd);
  }
  if (outcomes.length < MIN_TRACK_RECORD_SAMPLE) return null;
  const higherCount = outcomes.filter(Boolean).length;
  const historyDays = hist.length > 1 ? Math.round((hist[hist.length - 1].t - hist[0].t) / DAY_MS) : 0;
  return { sampleSize: outcomes.length, higherPct: Math.round((higherCount / outcomes.length) * 100), historyDays };
}

function computeSignal(hist, currentUsd) {
  const now = Date.now();
  const z7 = zScoreFor(hist, now, 7, currentUsd);
  const z30 = zScoreFor(hist, now, 30, currentUsd);
  const z90 = zScoreFor(hist, now, 90, currentUsd);

  const b7 = z7 ? bandFromZ(z7.z, z7.deltaPct) : null;
  const b30 = z30 ? bandFromZ(z30.z, z30.deltaPct) : null;
  const band = combineHorizons(b7, b30) || 'typical';
  const confidence = computeConfidenceTier(hist);
  const trackRecord = confidence.tier !== 'low' ? computeTrackRecord(hist, band) : null;

  return {
    today: currentUsd,
    band,
    meta: BAND_META[band],
    delta7: z7 ? z7.deltaPct : null, avg7: z7 ? z7.avg : null,
    delta30: z30 ? z30.deltaPct : null, avg30: z30 ? z30.avg : null,
    delta90: z90 ? z90.deltaPct : null, avg90: z90 ? z90.avg : null,
    confidence,
    trackRecord,
    history: hist
  };
}
