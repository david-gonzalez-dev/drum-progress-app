# App Store screenshots: what to capture (iPhone, demo account `drumskills.demo`)

Take plain screenshots on your iPhone (side button + volume up). Put them in `raw/` with these exact names, then run `python3 make_screenshots.py`.
The script frames them, adds the caption, and writes the two App Store sizes to `out/6.9-inch/` and `out/6.5-inch/`.

| File name | Screen to capture | Caption |
|---|---|---|
| `1-home.png` | Home tab: streak, daily goal, Start Practice card | Log every practice |
| `2-practice.png` | Practice > Skill Trainer: the three level cards with the drum photos | Climb the tempo ladder |
| `3-metronome.png` | The Skill Trainer metronome window with the notation and strokes visible | Practise with the metronome |
| `4-progress.png` | Progress tab: the Milestones rings (scroll so the rings show) | See your progress grow |
| `5-leaderboard.png` | The leaderboard screen with several players (the 5 places filled) | Compete with drummers worldwide |
| `6-challenges.png` | Practice > Personal challenges with an active and a completed (gold) card | Take on daily challenges |

Tips
- Use the demo account with some real-looking data: a streak, several unlocked tempos, a completed challenge. No real names or emails of other people on screen (use made-up names in the demo group).
- Same phone, same time of day, battery and signal full (the status bar shows in the screenshot).
- Apple needs at least 1 and at most 10 screenshots per size. 6 is a good number.
- Extra idea: take one screenshot of a celebration (for example the Level up or Streak animation at its final frame) and save it as `7-celebration.png`. Tell me and I will add a caption for it.
