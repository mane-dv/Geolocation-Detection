# RemoteDeskGeo — Geolocation Detection Logic

This document explains how **RemoteDeskGeo** obtains GPS latitude/longitude, stores them, and decides whether the user is within the allowed work-site range.

---

## 1. Purpose

RemoteDeskGeo answers one question:

> Is the user’s **current GPS position** within **N meters** of a known **work-site coordinate**?

The app does this in three separate steps (detect → configure → compare) so GPS capture and range checking are not combined in a single action.

---

## 2. High-level flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Detect Current GPS                                     │
│  Browser Geolocation API → latitude, longitude, accuracy        │
│  Stored in memory as `currentPosition`                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  Step 2: Work site (manual input)                               │
│  work latitude, work longitude, allowed range (meters, default 500)│
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  Step 3: Compare                                                │
│  Haversine distance(current, work) ≤ range ? IN RANGE : OUT     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Architecture

| Layer | File | Role |
|--------|------|------|
| **UI & logic** | `src/index.html` | GPS request, validation, distance math, UI updates |
| **Electron shell** | `main.js` | Window, geolocation **permission** dialog, app protocol |
| **Bridge** | `preload.js` | Exposes `fetchIPLocation` (not used by current UI flow) |

GPS coordinates are read in the **renderer** via the standard web API `navigator.geolocation`. Electron forwards the OS location permission through Chromium.

---

## 4. Step 1 — Detect current GPS

### 4.1 Trigger

User clicks **Detect Current GPS**, which calls `detectCurrent()`.

### 4.2 API used

```javascript
navigator.geolocation.getCurrentPosition(success, error, options)
```

### 4.3 Options (important for accuracy)

| Option | Value | Meaning |
|--------|--------|---------|
| `enableHighAccuracy` | `true` | Prefer GPS hardware over coarse Wi‑Fi/cell estimate |
| `timeout` | `15000` ms | Fail if no fix within 15 seconds |
| `maximumAge` | `0` | Do not reuse an old cached position |

### 4.4 Success — what is stored

On success, the app saves an in-memory object (not persisted to disk):

```javascript
currentPosition = {
  lat: coords.latitude,      // decimal degrees, WGS84
  lng: coords.longitude,     // decimal degrees, WGS84
  accuracy: coords.accuracy, // meters (radius of uncertainty)
  detectedAt: new Date()     // local timestamp when fix was taken
}
```

These values are shown in the UI and used later in Step 3. **Compare** stays disabled until this step succeeds.

### 4.5 Permission (Electron)

Before the browser can read location, Electron shows a dialog (`main.js`):

- User chooses **Allow** or **Deny**
- Only `geolocation` permission is gated this way

If denied, the renderer receives error code `1` (see errors below).

### 4.6 Error codes

| Code | User message (summary) |
|------|-------------------------|
| `1` | Permission denied |
| `2` | Position unavailable (location services off / no fix) |
| `3` | Request timed out (15 s) |
| Other | Generic GPS failure |

On any error, `currentPosition` is cleared and **Compare** is disabled again.

---

## 5. Step 2 — Work site coordinates

User enters:

| Field | Valid range | Default |
|--------|-------------|---------|
| Work latitude | −90 to 90 | (empty — user must enter) |
| Work longitude | −180 to 180 | (empty — user must enter) |
| Allowed range | &gt; 0 meters | **500** |

Validation runs in `validateWorkInputs()` only when the user clicks **Compare**, not during GPS detection.

---

## 6. Step 3 — Compare (distance & in-range)

### 6.1 Preconditions

1. `currentPosition` must exist (Step 1 completed).
2. Work latitude, longitude, and range must parse as valid numbers.

### 6.2 Distance calculation — Haversine formula

The app treats Earth as a sphere with radius **R = 6,371,000 m** and computes the great-circle distance between two WGS84 points:

```
Inputs:
  (lat1, lon1) = current GPS  (currentPosition)
  (lat2, lon2) = work site    (user input)

Convert degrees → radians
Δlat = lat2 − lat1
Δlon = lon2 − lon1

a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
c = 2 · atan2(√a, √(1−a))
distance = R · c   (meters)
```

Implementation: `distanceMeters()` in `src/index.html`.

This is standard for short-range attendance checks (meters to a few km). It does not account for altitude or local geoid undulation.

### 6.3 In-range decision

```javascript
inRange = distance <= work.range
```

| Result | Condition |
|--------|-----------|
| **In range** | Distance ≤ allowed range (e.g. ≤ 500 m) |
| **Out of range** | Distance &gt; allowed range |

The UI shows distance, allowed range, work coordinates, and comparison time. Status badge and message reflect the outcome.

---

## 7. Coordinate system

- All latitude/longitude values use **WGS84** (same as GPS and Google Maps `q=lat,lng` links).
- Display format: **6 decimal places** (~0.1 m precision at equator).
- Accuracy is shown as **± N m** from `coords.accuracy` (browser/OS estimate).

---

## 8. What this app does *not* do

| Topic | Behavior |
|--------|----------|
| **IP-based location** | `main.js` can fetch IP geolocation via `ipapi.co`, but the **current UI does not use it**. Attendance is GPS-only. |
| **Continuous tracking** | Single `getCurrentPosition` per detect click — no `watchPosition`. |
| **Persistent storage** | Coordinates live in RAM until the app is closed or detect is run again. |
| **Server upload** | No coordinates are sent to a backend from this app. |

---

## 9. Sequence diagram (detect + compare)

```
User          UI (index.html)        Electron (main.js)       OS / GPS
  |                 |                        |                    |
  |-- Detect GPS -->|                        |                    |
  |                 |-- permission request ->| (dialog if needed) |
  |                 |<- allow/deny ----------|                    |
  |                 |-- getCurrentPosition ---------------------->|
  |                 |<- lat, lng, accuracy ------------------------|
  |                 |  store currentPosition |                    |
  |<- show coords --|                        |                    |
  |                 |                        |                    |
  |-- enter work -->|                        |                    |
  |-- Compare ----->|                        |                    |
  |                 |  Haversine distance    |                    |
  |                 |  inRange = d <= range  |                    |
  |<- result -------|                        |                    |
```

---

## 10. Code reference (main functions)

| Function | File | Purpose |
|----------|------|---------|
| `getCurrentPosition()` | `src/index.html` | Wraps `navigator.geolocation` in a Promise |
| `detectCurrent()` | `src/index.html` | Step 1 — fetch and display GPS |
| `validateWorkInputs()` | `src/index.html` | Step 2 validation at compare time |
| `distanceMeters()` | `src/index.html` | Haversine distance in meters |
| `compareLocation()` | `src/index.html` | Step 3 — compare and show result |
| `setPermissionRequestHandler` | `main.js` | Geolocation allow/deny dialog |

---

## 11. Practical notes for operators

1. **Run Detect first** — Compare uses the last successful GPS fix, not a live re-read.
2. **Accuracy matters** — If accuracy is ±100 m, a 50 m range rule may be unreliable.
3. **Desktop GPS** — Laptops without GPS may use Wi‑Fi positioning (less accurate than phone GPS).
4. **Re-detect** — User can click Detect again to refresh position before comparing.

---

## 12. Example

| Item | Value |
|------|--------|
| Work site | 18.520430, 73.856743 |
| Allowed range | 500 m |
| Current GPS | 18.521000, 73.857100 |
| Computed distance | ~85 m (example) |
| Result | **In range** (85 ≤ 500) |

---

*RemoteDeskGeo v1.0 — GPS work-site verification*
