# 📡 ET Geolocation — Electron App

Detects and displays the user's location using a **two-method fallback strategy**:

1. **Browser Geolocation API** (GPS / Wi-Fi positioning) — high accuracy, requires OS permission
2. **IP Geolocation fallback** (via [ipapi.co](https://ipapi.co)) — city-level, always works, no permission needed

---

## Project Structure

```
et-geolocation/
├── main.js          ← Electron main process (IPC, protocol, permissions)
├── preload.js       ← Secure context bridge (exposes IP fetch to renderer)
├── src/
│   └── index.html   ← UI (renderer)
├── package.json
├── .gitignore
└── README.md
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (bundled with Node.js)

---

## Setup

```bash
npm install
```

---

## Run in Development

```bash
npm start
```

---

## Build for Distribution

```bash
# macOS — produces .dmg (Intel + Apple Silicon)
npm run build:mac

# Windows — produces .exe NSIS installer
npm run build:win

# Linux — produces .AppImage
npm run build:linux

# All platforms at once
npm run build:all
```

> Built files are output to the `dist/` folder.

---

## How It Works

### Architecture

```
Renderer (index.html)
  │
  ├─ 1. navigator.geolocation.getCurrentPosition()
  │       ↓ success → show GPS/Wi-Fi coordinates
  │       ↓ fail (no hardware / OS blocked)
  │
  └─ 2. window.electronAPI.fetchIPLocation()   ← via preload bridge
           │
           └─ IPC → main.js → Node https.get('https://ipapi.co/json/')
                                ↓
                          lat, lng, city, region, country, IP
```

### Why IPC for IP geolocation?
The renderer runs in a sandboxed Chromium context. Fetching external URLs from the renderer can be blocked by CORS or Electron's network sandbox. Routing the fetch through the **main process** (Node.js `https` module) bypasses both issues reliably.

### Why `app://` custom protocol?
The browser Geolocation API requires a **secure context** (`https://` or `localhost`). Loading via `file://` does not qualify. Registering `app://` as a privileged scheme with `protocol.registerSchemesAsPrivileged()` tells Chromium to treat it like `https://`.

---

## Geolocation Sources

| Source | Accuracy | Requires Permission | Works Offline |
|--------|----------|-------------------|---------------|
| Browser (GPS/Wi-Fi) | 10–100 m | Yes (OS prompt) | No |
| IP Geolocation | 1–50 km | No | No |

---

## Notes

- On **macOS**, location access must be granted to Electron in:
  `System Settings → Privacy & Security → Location Services`
- On **Windows**, location must be enabled in:
  `Settings → Privacy & Security → Location`
- If both methods fail, the app shows an error with guidance
