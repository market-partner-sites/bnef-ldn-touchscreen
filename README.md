# BNEF Summit London — touchscreen kiosk

A portrait (1080 × 1920) touchscreen page for the Summit floor: live agenda,
session & speaker detail, a venue map and a feedback QR code. Plain
HTML/CSS/JS — no build step, no dependencies beyond the bundled QR library.

## Screens

- **Attract loop** — shown after `idleSeconds` untouched (default 90s). Rotates
  what's on now / next and a feedback prompt. Any tap opens Home. Everything
  resets (sheet closed, Home, today's agenda, kiosk's own floor on the map).
- **Home** — Happening now (with live progress), Up next, shortcuts.
- **Agenda** — Day 1 / Day 2, today selected automatically. Past slots fade, a
  NOW marker shows where you are, parallel tracks are grouped and colour-coded.
  Tap any session for its synopsis, speakers (tap a speaker for their bio and
  other sessions) and a "Find … on the map" button.
- **Venue map** — the venue's own floor plan (from *BNEF London Map
  App_01.pdf*, cropped per floor into `assets/img/map/`), one tab per floor, "You are here" marker,
  live dots on rooms with something running. Tap a room for what's on there.
- **Feedback** — large QR code to the survey.

## Before the event — things to set in `assets/js/config.js`

1. **`feedbackUrl`** — currently a placeholder (`example.com`). The QR code is
   generated from this at load time.
2. **`rooms`** — the agenda API has no room field yet, so sessions are placed by
   rule: stand-alone sessions → Main Plenary, breaks → BNEF Hub & Networking
   Lounge, Track 1/2/3 → Track 1/2/3 (lower ground). If rooms are later filled
   in on the event platform and match a map label (e.g. "Beech 1"), those win.
3. **Kiosk position** — the "You are here" marker defaults to Registration on
   the ground floor (`venue.kiosks` in `config.js`).
4. **Fonts** — Avenir Next P for BBG files go in `assets/fonts/` (see the top
   of `assets/css/kiosk.css`); until then it falls back to Avenir / system sans.

## Several kiosks

Each screen can load the same URL with its own position:

```
index.html?kiosk=registration
```

Add more entries under `venue.kiosks` in `config.js` (floor + x/y in that floor's map units).

Other URL options: `?cursor=hide` (hide the pointer on the totem),
`?now=2026-10-19T11:55` or `#demo` (rehearse at a given time), `?attract=1`,
`?view=agenda|map|feedback`.

## Data

Same approach as the Summit site: tries the live bbgevent.app APIs, and falls
back to `data/agenda.json`, `data/speakers.json`, `data/relationships.json`.
`.github/workflows/refresh-data.yml` refreshes those every ~15 minutes once the
folder is pushed to GitHub with Actions enabled (Settings → Actions → General →
"Read and write permissions"). The kiosk re-reads the data every 5 minutes and
does a full reload at 04:00.

**Serve it over http(s)** — e.g. GitHub Pages — rather than opening
`index.html` from disk; browsers block `fetch()` of local JSON files.
For a quick local test: `python3 -m http.server` in this folder, then open
http://localhost:8000.

Speaker photos are saved in `assets/img/speakers/` (named by the platform's
photo id), so they show even if the photo server is unreachable. A speaker
added after this snapshot uses the live photo URL, then initials. To refresh
the saved photos, ask Claude to re-run the photo export.

## Running on the totem

Chrome in kiosk mode, e.g.

```
google-chrome --kiosk --noerrdialogs --disable-pinch --overscroll-history-navigation=0 \
  "https://<your-pages-url>/?kiosk=registration&cursor=hide"
```

The page scales itself to fit any screen while keeping the 9:16 layout, blocks
long-press menus and pinch-zoom, and requests a screen wake lock.
