# Vaktija — masjid prayer-times board

A prayer-times board for one masjid, hosted for free on Cloudflare Pages.

- **Board** (for the TV): `https://<your-project>.pages.dev/`
- **Admin** (for your laptop): `https://<your-project>.pages.dev/admin/`

The board needs no login. Admin is protected by a PIN that is stored on Cloudflare as a secret. Settings are kept in one Cloudflare KV value. The TV checks for new settings every 30 seconds, so changes appear within about a minute.

## What's in the folder

| Path | What it is |
|---|---|
| `public/index.html` | The board shown on the TV |
| `public/admin/index.html` | The admin page |
| `public/admin/manifest.webmanifest`, `icon-*.png` | Lets admin be added to a phone's home screen as an app |
| `public/shared.js` | Shared code: the official takvim for 118 locations and the prayer-time math |
| `public/sw.js` | Keeps a copy of the board in the TV's browser so it can start and reload without internet |
| `public/_headers` | Small security headers (admin is hidden from search engines) |
| `functions/api/settings.js` | Reads settings (public) and saves them (PIN required) |
| `functions/api/login.js` | Checks the admin PIN |
| `functions/api/ping.js` | The TV reports that it is on (every 5 minutes) |
| `functions/api/screens.js` | Admin reads which screens have reported in (PIN required) |
| `worker/alert.js` | Separate small Worker: checks every 10 minutes and sends a phone notification (ntfy) when the screen stops reporting. See "Offline alert" |
| `lib/screens.js` | Stores screen reports, at most one write per 3 minutes to stay within the free plan |
| `lib/auth.js` | PIN check with a limit of 10 wrong attempts per 15 minutes |
| `tests/run.mjs` | Checks for the prayer-time rules (takvim, summer/winter time, džuma, offsets, notes). Run with `node tests/run.mjs`; GitHub runs them on every pull request |
| `seed-settings.json` | Your current settings from the test version, to copy over in step 6 |

## Setup (about 20 minutes, once)

You need a free **GitHub** account and a free **Cloudflare** account. Cloudflare's menus are occasionally renamed; if a label differs slightly, look for the closest match.

### 1. Put the code on GitHub

1. On github.com, click **New repository**. Name it `vaktija`, choose **Private**, and create it.
2. On the empty repository page, click **uploading an existing file**.
3. Drag in everything from this folder (`public`, `functions`, `lib`, `README.md`, `seed-settings.json`) and click **Commit changes**.

### 2. Create the Cloudflare Pages project

1. In the Cloudflare dashboard, open **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Connect your GitHub account and pick the `vaktija` repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
4. Click **Save and Deploy**. When it finishes, Cloudflare shows your address, for example `vaktija-abc.pages.dev`. The project name you choose here becomes that address.

### 3. Create the settings store

1. In the dashboard, open **Storage & Databases** → **KV** → **Create**.
2. Name it `vaktija-settings` and create it.

### 4. Connect the store and set your PIN

In your Pages project, open **Settings**:

1. Under **Bindings**, add a **KV namespace** binding:
   - Variable name: `VAKTIJA` (exactly this, in capitals)
   - KV namespace: `vaktija-settings`
2. Under **Variables and Secrets**, add a variable:
   - Type: **Secret**
   - Name: `ADMIN_PIN`
   - Value: your PIN (digits are easiest on a phone; longer is safer, 6+ recommended)
3. Make sure both are added for **Production**.

### 5. Redeploy so the settings take effect

Open **Deployments**, find the latest deployment, and choose **Retry deployment** from its menu.

### 6. Bring over your current settings (optional)

1. Open **Storage & Databases** → **KV** → `vaktija-settings`.
2. Add an entry with key `settings` and paste the contents of `seed-settings.json` as the value.

You can skip this and enter everything in admin instead.

### 7. Check it works

1. Open `https://<your-project>.pages.dev/admin/`, enter your PIN, change something small, and save.
2. Open `https://<your-project>.pages.dev/` in another tab. Within a minute it shows your change.

## The TV in the masjid

- Open `https://<your-project>.pages.dev/` and make the browser full screen. Moving the mouse shows a small full-screen button in the corner.
- Choose the layout per screen by adding to the link:
  - `?raspored=horizontalno` always horizontal
  - `?raspored=vertikalno` always vertical
  - `?raspored=rotirano` vertical, picture turned 90°, for a TV hung on its side that can't rotate its own output
  - no addition: follows the admin layout setting
- The board reloads itself every night between 03:30 and 05:00 to pick up updates, but only when it can reach the server, so a dropped connection never leaves an error page on the screen.
- If the internet drops, the board keeps running with correct times and the last settings it received. Once it has been opened online, it can also start without internet (for example after a power cut, when the TV comes up before the router).
- For a reliable setup, an Android TV stick with a kiosk browser app (one that starts on power-up and keeps the screen awake) works well.

## Everyday use

Open `/admin/` on your laptop or phone and enter the PIN. Tick **Zapamti ovaj uređaj** on your own devices so you aren't asked for the PIN every time. Admin has three parts (a menu on the left on a laptop, a tab bar at the bottom on a phone):

- **Danas**: today's times as shown on the board. Tap a prayer to set a time for today only, or a permanent offset in minutes. Below are quick on/off switches for the full-screen announcement, Džuma on Fridays, and night mode.
- **Obavijesti**: the notes that rotate at the bottom of the board (with optional dates and weekdays), and the full-screen announcement text. **Ukloni** moves a note to the **Arhiva** (up to 30 are kept), where notes whose end date has passed also appear; **Ponovi** puts one back on the board without retyping it.
- **Ekran**: whether the screen in the masjid is on (it reports every 5 minutes; after 12 minutes of silence it shows as offline) and whether it shows the latest saved settings, plus a live preview of the board that already includes your unsaved changes. The dot in the top bar shows the same status from any tab. Each device is listed by type and size (e.g. "Android TV · Chrome · 1920×1080"); tap **Ovo je ekran u džamiji** on the real TV and name it. After that only marked screens count, other devices (your phone, laptop) move to a collapsed **Drugi uređaji** list and drop off after a day. Devices where the admin PIN is remembered don't report at all.
- **Podešavanja**: things set once: masjid name, prayer-time source and city, board layout, seconds and note timing, night mode details, colors, and **Odjavi se**. Each group shows its current value when closed.

When something changes, a bar appears at the bottom with **Sačuvaj** and **Odbaci**. A dot on a tab marks unsaved changes there. The board layout (Podešavanja → Prikaz na ekranu) is the one setting that saves immediately.

Colors: pick the main color (background) and the secondary color (accent), or click one of the ready-made pairs. Card shades follow the main color automatically, a warning appears if a pair would be hard to read, and **Vrati zadane boje** returns to the original navy and gold.

### Admin as an app on your phone

Podešavanja → Ovaj uređaj shows how to add admin to the home screen (Android: **Instaliraj aplikaciju**; iPhone: Safari → Share → **Add to Home Screen**). It then opens full screen with its own icon. On iPhone, log in once inside the app with **Zapamti ovaj uređaj**, because it keeps its own storage separate from Safari.

## Offline alert (optional, about 10 minutes, once)

A small separate Cloudflare Worker checks every 10 minutes whether the screen is still reporting, and sends a notification to your phone through the free **ntfy** app if it has been silent longer than the time set in admin (Ekran → Obavještenje na telefon), and again when it is back. Admin also shows the steps below with your topic name filled in.

1. Install **ntfy** (Google Play / App Store), tap **+** and subscribe to a private topic name, for example the one admin suggests (`vaktija-` plus 12 random characters). Anyone who knows the name can read the notifications, so don't use a guessable one.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Create Worker**, name it `vaktija-obavjestenja`, **Deploy**.
3. **Edit code**: replace the example with the contents of `worker/alert.js`, **Deploy**.
4. Worker **Settings → Bindings → Add → KV namespace**: variable name `VAKTIJA`, namespace `vaktija-settings`.
5. **Settings → Variables and Secrets → Add**: type **Secret**, name `NTFY_TOPIC`, value = your topic. Optionally add a text variable `ADMIN_URL` = `https://<your-project>.pages.dev/admin/#ekran` so tapping a notification opens admin.
6. **Settings → Trigger events → Add → Cron Triggers**: `*/10 * * * *`.

Within 10 minutes your phone gets "obavještenja su uključena", and admin shows **Povezano**. Opening the Worker's own address shows whether something is missing. If `worker/alert.js` changes later, paste the new version the same way (step 3).

The Worker only reads settings and screen reports, and writes to storage only when it sends something, so it stays well within the free plan.

## Changing the PIN

In the Pages project: **Settings** → **Variables and Secrets** → edit `ADMIN_PIN`, then redeploy (step 5). Every device then has to log in again with the new PIN.

## Updating the code

Upload changed files to the GitHub repository (or replace them there). Cloudflare redeploys automatically within a minute or two, and the TV picks up the new version at its next nightly reload, or immediately if you reload it.

## Checking changes

Before merging a change, the **Tests** check on the pull request must be green. It runs `tests/run.mjs`, which compares the board's times with the official takvim and checks the džuma, summer/winter time, offset, manual-time and note rules. To run it yourself, install Node.js and run `node tests/run.mjs` in this folder.

## Costs

Cloudflare's free plan covers this comfortably: one TV reading every 30 seconds uses under 3,000 reads a day, and saves are rare. Screen status reports are written at most once every 3 minutes (under 500 writes a day, within the free 1,000), so saves always have room.

## Notes

- Prayer times come from the official IZ BiH takvim as published by vaktija.ba. Their source repository has no license attached, so if the board is ever offered beyond your own masjid, ask for permission at info@vaktija.ba first.
- If two people edit at the same time, the second save is stopped with a notice instead of silently overwriting the first. You can then load the newer settings or save yours over them. The layout switch at the top merges itself with the newer settings automatically.
