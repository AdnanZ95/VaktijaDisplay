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
| `public/shared.js` | Shared code: the official takvim for 118 locations and the prayer-time math |
| `public/_headers` | Small security headers (admin is hidden from search engines) |
| `functions/api/settings.js` | Reads settings (public) and saves them (PIN required) |
| `functions/api/login.js` | Checks the admin PIN |
| `lib/auth.js` | PIN check with a limit of 10 wrong attempts per 15 minutes |
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
- The board reloads itself every night at 03:30 to pick up updates.
- If the internet drops, the board keeps running with correct times and the last settings it received.
- For a reliable setup, an Android TV stick with a kiosk browser app (one that starts on power-up and keeps the screen awake) works well.

## Everyday use

- Open `/admin/` on your laptop or phone, enter the PIN, make changes, and press **Sačuvaj promjene**. The layout switch at the top saves immediately.
- Tick **Zapamti ovaj uređaj** on your own laptop so you aren't asked for the PIN every time.
- **Odjavi se** logs that device out.

## Changing the PIN

In the Pages project: **Settings** → **Variables and Secrets** → edit `ADMIN_PIN`, then redeploy (step 5). Every device then has to log in again with the new PIN.

## Updating the code

Upload changed files to the GitHub repository (or replace them there). Cloudflare redeploys automatically within a minute or two, and the TV picks up the new version at its next nightly reload, or immediately if you reload it.

## Costs

Cloudflare's free plan covers this comfortably: one TV reading every 30 seconds uses under 3,000 reads a day, and saves are rare.

## Notes

- Prayer times come from the official IZ BiH takvim as published by vaktija.ba. Their source repository has no license attached, so if the board is ever offered beyond your own masjid, ask for permission at info@vaktija.ba first.
- Only one person should edit at a time; the last save wins.
