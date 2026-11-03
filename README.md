# Leave & OIL Tracker

A mobile-first web app for tracking your direct reports' **annual leave (AL)** and **off-in-lieu (OIL)** balances.
No server or build step is needed. It is plain HTML/CSS/JS and installs to your phone's home screen (PWA, works offline).

## Features
- **Team view**: everyone's AL and OIL left at a glance, team totals, search, and who is on leave today.
- **Admin panel**
  - Add, edit or delete resources with their AL quota and an opening OIL balance (with optional expiry).
  - Bulk add with one line per person: `Name, AL quota, OIL balance`.
  - Add OIL credits (days, date earned, expiry, reason).
  - Balance adjustments for carry-forward, corrections or forfeits.
  - New leave year: downloads a backup, clears AL history, carries forward unused AL up to a limit you set, and keeps unused OIL.
  - Export a backup (JSON), import it, and export balances as CSV.
  - Optional admin PIN.
- **Apply leave**: pick a person, choose AL or OIL, and set the dates. Working days (Mon–Fri) are calculated for you, half days are supported, and you can edit the day count for public holidays. You see the balance before and after, plus warnings for not enough balance or overlapping leave.
- **History** per person. Removing an entry returns the days to the balance.
- **OIL expiry tracking**: credits that expire first are used first. Credits expiring within 30 days and expired ones are flagged, and you can forfeit expired OIL with one tap.

## Run it
Serve the folder over HTTP, for example:
```
python3 -m http.server 8000
```
Then open http://localhost:8000. To use it on your phone, host it on any static host (GitHub Pages, Netlify, etc.), open it in the browser and choose **Add to Home Screen**.

## Data & privacy
All data is stored in the browser on the device you use (localStorage). It is **not** synced between devices. Use
*Admin → Export backup* regularly, and *Import backup* to move data to another device. The admin PIN only stops casual edits. It is not encryption.
