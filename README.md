# Gold Price Tracker (PWA)

Tracks live gold spot price, converts to 22K & 24K price per gram in **INR** and **SAR**,
with a popup notification every 2 hours (configurable) — plus a full set of tools for
long-term retail gold accumulation (e.g. saving for a wedding set):

- **Live price cards** — spot, local-market-adjusted, and jeweller-inclusive (making charges) prices, per gram or scaled to a chosen weight (8g/10g/1 tola/etc.)
- **Price trend + buy signal** — builds its own price history from your checks over time, shows a sparkline, and flags when the price drops meaningfully below its rolling average
- **India vs Saudi comparison** — converts both to ₹ so you can see which market is cheaper right now
- **Goal tracker** — set a target weight (e.g. "150g for daughter's wedding"), track progress
- **Purchase log** — record real purchases (date, karat, weight, price, jeweller), running totals and average cost
- **NRI gold duty-free allowance reference** — quick lookup, India Baggage Rules 2026
- **Export/Import backup** — since everything lives in browser local storage only

## What's in this folder
- `index.html` - the app
- `manifest.json` - makes it installable on your phone home screen
- `sw.js` - service worker (offline shell caching, background check + notification)
- `icon-192.png`, `icon-512.png` - app icons

## Data sources (both free, no signup)
- Gold spot price: `https://api.gold-api.com/price/XAU` (USD per troy ounce)
- Exchange rates: `https://open.er-api.com/v6/latest/USD` (USD -> INR, USD -> SAR)

Formula: `price_per_gram_24k = spot_usd_per_oz / 31.1034768`, and `22k = 24k * (22/24)` (91.67% purity),
then multiplied by the INR/SAR exchange rate.

## How to install on your Android phone

**This needs to be served over HTTPS (or localhost) for install + notifications to work** —
phone browsers won't install a PWA or grant notification permission from a plain `file://` page.
Easiest free options:

### Option A — GitHub Pages (recommended, 5 minutes, free)
1. Create a new GitHub repo (e.g. `gold-tracker`).
2. Upload these 5 files to the repo root.
3. Repo Settings → Pages → Deploy from branch → `main` / root.
4. Wait ~1 minute, then open the given `https://<username>.github.io/gold-tracker/` URL on your phone in Chrome.
5. Tap the Chrome menu (⋮) → **"Add to Home screen"** / **"Install app"**.
6. Open the installed app, tap the **Notifications** toggle, allow the permission prompt.

### Option B — Netlify Drop
1. Go to https://app.netlify.com/drop on your computer.
2. Drag this folder in — it gives you an instant HTTPS URL.
3. Open that URL on your phone and install as above.

### Option C — any web host you already have
Just upload the 5 files to any HTTPS web host, same steps.

## Using the app
- Open it → it fetches the live price immediately and shows 22K/24K in ₹ and SAR.
- Toggle **Notifications** on and allow the permission prompt — this is required for the popup.
- **Check interval** defaults to 2 hours; you can change it to 30 min / 1 hr / 4 hr.
- "Check Price Now" does an on-demand fetch.
- Last 8 checks are logged on-screen (stored locally on your phone only).

## Important limitation — please read
This is a web app, not a native Android app. That means:
- The 2-hour timer runs reliably **while the app is open or sitting in your recent-apps
  background** (not force-swiped-closed). This covers normal phone use fine.
- If you **force-close** the app or your phone aggressively kills background tabs
  (common on some Xiaomi/Huawei/OnePlus battery savers), the timer pauses until you reopen it.
  Go to Android Settings → Apps → Chrome (or your browser) → Battery → **"Unrestricted"**
  to reduce this.
- I also registered Chrome's experimental **Periodic Background Sync** as a bonus mechanism —
  it can fire even when the app isn't open, but Chrome decides the actual interval based on
  how often you use the app, so it's not a guaranteed 2-hour clock.

If you want a rock-solid, always-on-time 2-hour alarm regardless of app state or battery
optimization, that needs a real native Android app (Kotlin + `AlarmManager`/`WorkManager`,
built and signed via Android Studio) — happy to build that version too if this PWA
doesn't hold up well enough on your phone in practice.

## Customizing
- Change interval options: edit the `<select id="intervalSelect">` in `index.html`.
- Change colors: edit the `:root { ... }` CSS variables at the top of `index.html`.
- Change purity math (e.g. add 18K): edit the JS math in both `index.html` and `sw.js`.
