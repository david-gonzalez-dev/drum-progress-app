# DrumSkills: App Store listing (ready to paste, updated 2026-10-15)

Character limits are Apple's. No em dashes anywhere, on purpose.

## Basics
- **App name** (max 30): DrumSkills
  - Fallback if taken: "DrumSkills: Practice Log"
- **Subtitle** (max 30): Practice log, tempo, groups
- **Primary category:** Music
- **Secondary category:** Education
- **Not** in the "Kids" category (it has accounts and groups, and Kids rules are very strict).
- **Price:** Free
- **Support URL:** https://practice-masters.com/drumskills-support/
- **Privacy policy URL:** https://practice-masters.com/drumskills-privacy-policy/
- **Terms of use:** https://practice-masters.com/drumskills-terms-of-use/ (put it in the description too, see the bottom of the description)
- **Marketing URL:** leave empty
- **Copyright:** 2026 David Gonzalez Arnesto
- These three links are the same ones the app opens, so the app and the store agree.

## Promotional text (max 170, can be changed any time without a new build)
Log every practice, unlock tempos, keep your streak and earn Drum Points. Built by a drum teacher for drummers of all ages.

## Description (max 4000)
DrumSkills is a practice companion for drummers. Log what you practised, build a streak, and watch your tempo go up level by level.

PRACTICE LOG
- Log your daily practice in minutes, with what you worked on
- Daily goal, current streak, longest streak and days practised this year
- Weekly and monthly stats so you can see the trend

SKILL TRAINER
- Rudiments and exercises with tempo ladders from beginner to legend
- Built-in metronome with the notation or the sticking on screen
- Rate how each tempo felt, unlock the next level and master it
- Foundation, intermediate and complex levels, and a progress view for every exercise

CELEBRATE PROGRESS
- Animations and sounds when you unlock a tempo, reach your daily goal, keep a streak or level up
- Milestones that show how far you have come

SESSION TIMER
- Stopwatch or countdown for a whole practice session
- Log the session when you are done

GROUPS
- Join your teacher's group with an invite code
- Group board, challenges, a shared calendar and a Hall of Fame
- Send ready-made cheers to your group, no chat

CHALLENGES
- Set your own challenge, like 3 minutes a day on one exercise for 7 days
- Your teacher can give you a challenge too

DRUM POINTS FOR YOUNG DRUMMERS
- Players aged 16 and younger can earn Drum Points: 1 point for every full minute of Skill Trainer practice
- Yearly and all-time boards with other young drummers who joined, showing first names only
- Optional: the app asks once, and it can be switched off any time in Settings

OPTIONAL WORLDWIDE LEADERBOARD
- Off by default. Join if you want to compare practice days with drummers in your age group.

PRIVATE BY DESIGN
- Your practice notes are private. Group members never see them.
- No ads, no tracking. You can delete your account and all your data inside the app.

Made by a drum teacher in the Netherlands.

Terms of use: https://practice-masters.com/drumskills-terms-of-use/
Privacy policy: https://practice-masters.com/drumskills-privacy-policy/

## Keywords (max 100 characters, comma separated, no spaces after commas)
drum,drums,drummer,practice,rudiments,metronome,paradiddle,tempo,timer,lessons,streak,teacher,log

## What's New (first version)
First release. Practice log, Skill Trainer, metronome, session timer, groups and challenges.

## Age rating questionnaire (suggested answers, David to confirm)
- Violence, sexual content, profanity, horror, drugs, gambling, medical: **None**
- Unrestricted web access: **No**
- **User-generated content:** the app shows names that users type (group names, challenge names, display names). Answer honestly: **Yes, limited** (no chat, no free-text posts to strangers; groups are private and joined by invite code).
- Expected result: **4+** (Apple may set 9+ or 12+ if you answer yes to UGC; that is fine).
- Students under 13 use it. A parent or teacher creates the account or gives permission (the sign-up checkbox). Do not enrol in the Kids category.

## App Privacy ("nutrition label") answers
Data collected, all **linked to the user**, all used only for **App Functionality**, **not used for tracking**:
- Contact info: email address
- Contact info: name (the display name)
- User content: practice notes and what you practised
- Identifiers: user ID
- Identifiers: **Device ID** (the push notification token; only if the user turns notifications on; deleted at log out or account deletion)
- Other data: **date of birth** (stored privately, only the age group is used)
- Usage data: **Product interaction** (practice sessions, tempos, points and rankings)
- Diagnostics / analytics: **none** (no analytics or crash SDK is installed)
- Tracking: **No.** No ad SDKs, so no App Tracking Transparency prompt is needed.

## Notes for App Review (paste into App Store Connect)
- Demo account: **email and password go in the "Sign-in required" boxes in App Store Connect (David types them there)**
- The app needs an account (email and password) because practice data is stored per user. Sign up is inside the app, and the confirmation email must be clicked, so please use the demo account above.
- Account deletion: Settings, then "Delete account" at the bottom. It deletes the account and all data.
- Groups are private. A user joins one with an invite code from their teacher. Demo group invite code: **(David writes it here)**.
- There is no chat. Group members can only send each other a few ready-made cheers; no free text.
- The worldwide leaderboard and Drum Points are optional and off by default. Players can leave at any time.
- No in-app purchases, no ads, no external payment links.
- Sign in with Apple is not offered because the iPhone app uses only email and password (Google sign-in is hidden in the app).

## Screenshots
Ten framed screenshots are ready in `app-store/screenshots/out/6.9-inch/` (upload 01 to 10 in order).

## Open decisions for David
- Is the final app ID `app.drumskills.ios`? (permanent once created)
- Which name, email, address and phone appear publicly if you declare yourself a trader in the EU? (Apple asks this under "Digital Services Act trader status"; as a business teacher in the Netherlands you should declare yourself a trader.)
- Free text still visible to others: group names, challenge names, display names. Apple (guideline 1.2) likes a way to report or block. Options: keep as is (low risk because groups are private and admin-made), or add a small "Report" button later.
