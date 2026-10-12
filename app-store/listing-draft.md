# DrumSkills: App Store listing draft (DRAFT, not submitted)

Everything here is a first draft for David to edit. Character limits are Apple's.
No em dashes anywhere, on purpose.

## Basics
- **App name** (max 30): DrumSkills
  - Fallback if taken: "Drum Progress: Practice Log"
- **Subtitle** (max 30): Practice log, tempo, groups
- **Primary category:** Music
- **Secondary category:** Education
- **Not** in the "Kids" category (it has accounts and groups, and Kids rules are very strict).
- **Price:** Free
- **Support URL:** https://drum-progress-app.vercel.app/support
- **Privacy policy URL:** https://drum-progress-app.vercel.app/privacy
- **Marketing URL:** (optional, leave empty)
- **Copyright:** 2026 David Gonzalez (use your own legal name, NOT "artenesto")

## Promotional text (max 170, can be changed any time without a new build)
Track every practice, climb tempo levels on rudiments and exercises, and keep your streak alive. Built by a drum teacher for drummers of all ages.

## Description (max 4000)
DrumSkills is a practice companion for drummers. Log what you practised, build a streak, and watch your tempo go up level by level.

PRACTICE LOG
- Log your daily practice in minutes, with what you worked on
- Daily goal, current streak, longest streak and days practised this year
- Weekly and monthly stats so you can see the trend

SKILL TRAINER
- Rudiments and exercises with tempo ladders from beginner to legend
- Built-in metronome, with the note value shown for each exercise
- Rate how each tempo felt and unlock the next level
- See which exercises you practise most

SESSION TIMER
- Stopwatch or countdown timer for a whole practice session
- Log the session when you are done, with what you practised

GROUPS
- Join your teacher's group with an invite code
- Leaderboards for days practised and time practised
- Group challenges, a shared calendar and a Hall of Fame
- Send ready-made cheers to cheer on your group, and heart the ones you get

PERSONAL CHALLENGES
- Set your own challenge, like 10 minutes a day on one exercise for 14 days
- Your teacher can also give you a challenge

PRIVATE BY DESIGN
- Your practice notes are private. Group members never see them.
- No ads, no tracking. You can delete your account and all your data inside the app.

Made by a drum teacher in the Netherlands.

## Keywords (max 100 characters, comma separated, no spaces after commas)
drum,drums,drummer,practice,rudiments,metronome,paradiddle,tempo,timer,lessons,streak,teacher,log

## What's New (first version)
First release. Practice log, Skill Trainer, Session Timer, groups and challenges.

## Age rating questionnaire (suggested answers, David to confirm)
- Violence, sexual content, profanity, horror, drugs, gambling, medical: **None**
- Unrestricted web access: **No**
- **User-generated content:** the app shows names that users type (group names, challenge names, display names). Answer honestly: **Yes, limited** (no chat, no free-text posts to strangers; groups are private and joined by invite code).
- Expected result: **4+** (Apple may set 9+ or 12+ if you answer yes to UGC; that is fine).
- Declared age range / under-13: students under 13 will use it. A parent or teacher creates the account or gives permission (the sign-up checkbox). Do not enrol in the Kids category.

## App Privacy ("nutrition label") answers
Data collected, all **linked to the user**, all used only for **App Functionality**, **not used for tracking**:
- Contact info: email address
- Contact info: name (the display name)
- User content: practice notes and what you practised
- Identifiers: user ID
- Usage data / diagnostics: **none** (no analytics or crash SDK is installed; confirm before submitting)
- Tracking: **No.** No ad SDKs, so no App Tracking Transparency prompt is needed.

## Notes for App Review (paste into App Store Connect)
- Demo account: **(David creates one and writes the email and password here)**
- The app needs an account (email and password) because practice data is stored per user. Sign up is inside the app.
- Account deletion: Settings, then "Delete account" at the bottom. It deletes the account and all data.
- Groups are private. A user joins one with an invite code from their teacher. To test, sign in with the demo account, open the Group tab, and join with the code **(David writes a demo group code here)**.
- There is no chat. Group members can only send each other a few ready-made cheers; no free text.
- Admin tools (teacher view) are only visible to teacher accounts and are not needed for review.
- No in-app purchases, no ads, no external payment links.
- Sign in with Apple is not offered because the iPhone app uses only email and password (Google sign-in is hidden in the app).

## Screenshots to take (6.9 inch iPhone size, from the simulator, with demo data)
1. Home: streak, today's goal, personal challenges
2. Practice: Skill Trainer exercise with the tempo ladder
3. Metronome with the session timer running
4. Group: leaderboard and Time practised
5. Group challenge card (compact) and cheers bell
6. Progress page

Suggested caption style, one short line each, no more than 5 words:
"Log every practice", "Climb the tempo ladder", "Time your whole session", "Practise with your crew", "Cheer each other on", "See your progress"

## Open decisions for David
- Is the final app ID `app.drumskills.ios`? (permanent once created)
- Which name, email, address and phone appear publicly if you declare yourself a trader in the EU?
- Free text still visible to others: group names, challenge names, the "If you lose" text, display names. Apple (guideline 1.2) likes a way to report or block. Options: keep as is (low risk because groups are private and admin-made), or add a small "Report" button later.
