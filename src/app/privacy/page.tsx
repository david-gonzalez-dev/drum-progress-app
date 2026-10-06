import type { Metadata } from "next";
import { LegalShell, SUPPORT_EMAIL } from "../legal-shell";

export const metadata: Metadata = { title: "Privacy Policy | Drum Progress", robots: { index: false } };

export default function PrivacyPage() {
  return <LegalShell title="Privacy Policy">
    <p>Drum Progress is a practice tracker for drum students and their teachers. This policy explains what information the app collects, how it is used, who can see it, and the choices you and your parents have. Questions can be sent to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>

    <h2>1. Information we collect</h2>
    <ul>
      <li><b>Account details:</b> your email address, a password (stored in scrambled form by our login provider, so we cannot read it) and the name you choose. If you sign in with Google, we receive your name and email address from Google.</li>
      <li><b>Practice information you enter:</b> practice days and minutes, whether you used a drum set or a practice pad, what you practiced, notes you write, Skill Trainer sessions (exercise, tempo, how it felt, optional notes and tags), pinned exercises, personal challenges, and your settings (language, daily goal, metronome sound).</li>
      <li><b>Group information:</b> groups you create or join, your calendar color, and group challenges.</li>
      <li><b>Points:</b> if your teacher uses the points game, the points and short reasons they give you.</li>
      <li><b>On your device:</b> the app keeps your login session, a few preferences and the state of a running Session Timer in your browser or app storage. We do not use advertising or tracking cookies.</li>
    </ul>

    <h2>2. How we use it</h2>
    <p>We use this information only to run the app: to save your practice, show your progress and streaks, run groups and challenges, keep accounts secure, and answer support requests. We do not sell it, we do not show ads, we do not use analytics or tracking tools, and we do not build advertising profiles.</p>

    <h2>3. Who can see your information</h2>
    <ul>
      <li><b>You</b> can see all of your own information.</li>
      <li><b>Members of the same group</b> can see your practice days, time practiced, what you practiced, the notes on those days, and your Skill Trainer progress.</li>
      <li><b>Your teacher</b> (the administrator of your group) can see the practice information of their students and can give points.</li>
      <li><b>Service providers</b> that run the app for us: our database and login provider (Supabase) and our web hosting provider. They only handle data to provide the service. If you choose Google sign-in, Google handles that login. The app also loads its fonts from Google Fonts, so Google can see your device&apos;s IP address when the app loads.</li>
      <li><b>Anyone else</b> only if the law requires us to share it.</li>
    </ul>

    <h2>4. Children</h2>
    <p>Drum Progress is used by drum students of all ages, including children under 13, who practice with a teacher or a parent. We keep the information we collect from children to what the app needs: a name (a first name or nickname is enough), an email address and their practice information. We never use children&apos;s information for advertising, tracking or profiling, and we never sell it.</p>
    <p>A parent or guardian can ask us at any time to show, correct or delete their child&apos;s information by writing to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or can delete the account directly in the app. The app has no chat. Parents and teachers should be aware that practice notes and group challenges are visible to the other members of the group.</p>

    <h2>5. Keeping and deleting your information</h2>
    <p>We keep your information while your account exists. You can permanently delete your account and all of your practice information at any time in the app under Settings, Delete account, or by writing to us.</p>

    <h2>6. Security</h2>
    <p>Information travels over encrypted connections, and the database is set up so that each person can only read what is described in section 3. No system is perfectly secure, so please choose a strong password and do not share it.</p>

    <h2>7. Where information is processed</h2>
    <p>Our providers may store and process information in countries other than your own.</p>

    <h2>8. Changes</h2>
    <p>If we change this policy in a meaningful way we will update the date above and, where it matters, tell you in the app.</p>

    <h2>9. Contact</h2>
    <p>Drum Progress, <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
  </LegalShell>;
}
