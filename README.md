# Health Quest

A retro handheld-RPG style web app (HTML, vanilla CSS and vanilla JS, no build step) that turns
your steps, sleep and other health data into daily quests, EXP, levels and badges.
The look is an original pixel-art take on early-2000s handheld RPG menus: double-bordered text
boxes, a typewriter dialog, a ▶ start menu, an overworld map and a trainer card.

## Run

Serve the folder over HTTP (service workers and notifications need it):

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

For your phone, host it on any static host (GitHub Pages works) and use **Add to Home Screen**.
On iOS, web notifications only work for home-screen apps (iOS 16.4+).

## Features

- **Overworld:** your character walks a route from home to a flag. Position = today's steps ÷ step goal.
- **HUD:** HP comes from last night's sleep against your goal. EXP fills toward the next level.
- **Daily quests** with claimable EXP:
  - Morning Stroll: 3,000 steps.
  - The Long Route: your step goal.
  - Extra Mile: 130% of your step goal.
  - Well Rested: your sleep goal.
  - Hydration: your water goal.
  - Training: your active-minutes goal.
  - Check-up: log your resting heart rate.
  - Champion Day: clear every other quest.
- **Trainer card:** level, EXP, streak, 7-day averages and a 7-day steps chart.
- **Badge case:** 8 badges for milestones and streaks.
- **Log:** enter steps, sleep, water, active minutes and resting heart rate for any day, or import a CSV.
  The CSV columns are `date, steps, sleep, water, active, hr`, in any order. Sleep given in minutes
  is converted to hours.
- **Notify control panel:**
  - Set the from/until window and the interval (30 min to 6 h).
  - Tap a time to skip it.
  - Choose what each summary includes.
  - See a live preview and send a test notification.
  - Each summary highlights steps done, steps left, quests cleared, sleep and water, level and EXP, and unclaimed rewards.
- **Options:** daily goals, text speed, JSON backup export/restore, erase save.

All data stays in `localStorage` on your device.

## Limits

- A web page can't read Apple Health or Google Fit directly. Data comes in through manual logging or CSV import.
- Scheduled summaries fire only while the app is open or recently backgrounded. Exact-time alerts
  when fully closed would need a push server.
