# DrumSkills on Google Play: checklist and listing draft (DRAFT, nothing submitted)

No em dashes anywhere, on purpose. Items marked CHECK must be verified in the Play Console, because Google changes its rules.

## What is already done in the project
- Android project in `android/` (Capacitor). Package name: **app.drumskills.android** (permanent once the app is published).
- Same web app as the iPhone version. Build and copy it with: `npm run android:build`
- Launcher icons, round icons and dark splash screens are generated from `app-store/icon-1024-square.png`.
- App backup is switched off, and the Google sign-in button is hidden in the app (Google blocks it inside app web views). Email and password sign-in works.
- Target Android 16 (API 36), minimum Android 7 (API 24).

## What David has to do (nobody else can)
1. **Install Android Studio** (free, about 1 GB): https://developer.android.com/studio . It brings its own Java. Open the folder `android` inside the project with it, and let it finish "Gradle sync".
2. **Google Play Developer account**: one-time fee (CHECK, about 25 USD). Personal accounts need identity verification. CHECK: new personal accounts must run a closed test with a minimum number of testers for about 14 days before production access.
3. **Signing key**: in Android Studio, Build > Generate Signed App Bundle > create a new keystore. **Back the keystore file and its passwords up in two places.** If it is lost, the app can never be updated. Use Play App Signing (the default).
4. **Build**: run `npm run android:build`, then Build > Generate Signed App Bundle (.aab). Upload that file to Play Console. (The review-only "unlock all rudiments" switch is never baked into phone builds, so nothing else to check.)
5. **Version numbers**: `versionCode` (a whole number, must go up by 1 for every upload) and `versionName` are in `android/app/build.gradle`. Currently 1 and "1.0".

## Store listing
- **App name** (max 30): DrumSkills
- **Short description** (max 80): Practice log, tempo trainer and metronome for drummers of all ages.
- **Category:** Music (or Education)
- **Contact email / website / privacy policy:** use the same support page and privacy URL as the iPhone app (the privacy page is already updated for date of birth and the leaderboard).
- **Full description** (max 4000): use the App Store description in `app-store/listing-draft.md`. It also fits Google Play. Add one line at the end: "Available in English, Spanish and Dutch."
- **Graphics Google asks for:** app icon 512x512 (use the 1024 icon scaled down), feature graphic 1024x500 (still to make), at least 2 phone screenshots (take them from the Android emulator or a phone).

## Data safety form (draft answers, CHECK each one)
- Collects: name (first name or nickname), email address, date of birth, user IDs, app activity (practice logs, sessions, points), notes the user writes.
- Shared with third parties: no, apart from the service providers that run the app (database and hosting). No advertising, no analytics SDKs.
- Encrypted in transit: yes. Deletion: users can delete their account and data inside the app (Settings, Delete account); also provide the same delete request URL.
- Optional vs required: date of birth is asked in onboarding but can be skipped.

## Rating, audience and children (IMPORTANT)
- The app is used by children (under 10). Google has a **Families Policy** that applies when an app is aimed at children or has children as part of its audience. CHECK: the target audience question in Play Console. If children under 13 are included, extra requirements apply (privacy policy rules, no ads based on behaviour, only approved SDKs, and more).
- Collecting a date of birth from children needs parental consent in many countries (see the privacy notes from the age feature). Get legal advice before choosing a target audience that includes under-13s.
- The conservative option for a first release: target audience 13+ in Play Console, and keep the under-10 and 10-13 experience for children whose teacher signs them up. Decide this with a lawyer.
- Content rating questionnaire: no violence, no purchases, no user-to-user free text chat (only ready-made cheers). Answer honestly: there are leaderboards with first names.

## Things to test on a real Android phone before submitting
- Metronome sound: no crackle, and the stroke guide stays in time with the clicks (Android WebView audio timing can differ from iPhone).
- Screen edges: the Android 15+ system bars (status and gesture bar) must not cover the bottom menu or the top of the pages.
- Keyboard: the on-screen keyboard must not hide the fields (sign-up, notes).
- Date picker in onboarding and Settings.
- Back button: it should go back a screen, not close the app unexpectedly.
- Airplane mode: friendly behaviour when offline.
