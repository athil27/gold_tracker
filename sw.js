const CACHE_NAME = 'gold-tracker-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never cache the live price/rate API calls - only cache app shell
  if (event.request.url.includes('gold-api.com') || event.request.url.includes('er-api.com')) {
    return;
  }
  // Network-first for the HTML page itself, so updates show up without manual cache clearing.
  // Falls back to cache only if offline.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Best-effort: Chrome on Android supports Periodic Background Sync for installed PWAs
// with sufficient "site engagement". This is NOT guaranteed to fire on a strict 2-hour
// clock - Chrome decides the actual interval. Treat this as a bonus, not the primary
// mechanism. The primary mechanism is the in-page timer in index.html while the app
// is open or backgrounded (not force-closed).
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'gold-price-check') {
    event.waitUntil(checkGoldPriceAndNotify());
  }
});

// Fallback for browsers without periodicsync but with one-off background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'gold-price-check-once') {
    event.waitUntil(checkGoldPriceAndNotify());
  }
});

async function checkGoldPriceAndNotify() {
  try {
    const goldRes = await fetch('https://api.gold-api.com/price/XAU');
    const goldData = await goldRes.json();
    const usdPerOz = goldData.price ?? goldData.rate ?? goldData.rates?.XAU ?? goldData.data?.price;
    if (!usdPerOz) throw new Error('Unexpected gold price response shape');

    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
    const fxData = await fxRes.json();
    const inrRate = fxData.rates.INR;
    const sarRate = fxData.rates.SAR;

    const GRAMS_PER_OZ = 31.1034768;
    const usd24k = usdPerOz / GRAMS_PER_OZ;
    const usd22k = usd24k * (22 / 24);

    // Mirrors the default "local market premium over spot" set in index.html settings.
    // If the user changes those sliders, this background-sync bonus path won't pick it up
    // until the app is reopened - the primary in-page timer always uses the live setting.
    const INR_PREMIUM = 1.14;
    const SAR_PREMIUM = 1.04;

    const inr24 = (usd24k * inrRate * INR_PREMIUM).toFixed(2);
    const inr22 = (usd22k * inrRate * INR_PREMIUM).toFixed(2);
    const sar24 = (usd24k * sarRate * SAR_PREMIUM).toFixed(2);
    const sar22 = (usd22k * sarRate * SAR_PREMIUM).toFixed(2);

    await self.registration.showNotification('Gold Price Update', {
      body: `24K: ₹${inr24} / SAR ${sar24}   |   22K: ₹${inr22} / SAR ${sar22}  (per gram)`,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'gold-price',
      renotify: true,
      data: { inr24, inr22, sar24, sar22, timestamp: Date.now() }
    });
  } catch (err) {
    console.error('Background gold price check failed', err);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
