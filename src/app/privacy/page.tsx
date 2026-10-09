import type { Metadata } from "next";
import { LegalShell, SUPPORT_EMAIL } from "../legal-shell";

export const metadata: Metadata = { title: "Privacy Policy | DrumSkills", robots: { index: false } };

export default function PrivacyPage() {
  return <LegalShell title="Privacy Policy">
    <p>DrumSkills is a practice tracker for drum students and their teachers. This policy explains what information the app collects, how it is used, who can see it, and the choices you and your parents have. Questions can be sent to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    <p>DrumSkills is run by David Gonzalez in the Netherlands. He is the person responsible for the information described here (the &quot;controller&quot; under the European privacy law, the GDPR).</p>

    <h2>1. Information we collect</h2>
    <ul>
      <li><b>Account details:</b> your email address, a password (stored in scrambled form by our login provider, so we cannot read it) and the name you choose. If you sign in with Google, we receive your name and email address from Google.</li>
      <li><b>Practice information you enter:</b> practice days and minutes, whether you used a drum set or a practice pad, what you practiced, notes you write, Skill Trainer sessions (exercise, tempo, how it felt, optional notes and tags), pinned exercises, personal challenges, and your settings (language, daily goal, metronome sound).</li>
      <li><b>Group information:</b> groups you create or join, your calendar color, group challenges, and challenges a teacher gives you.</li>
      <li><b>Cheers:</b> short ready-made messages (for example &quot;Go practice!&quot;) and hearts that group members send each other. There is no free-text chat. Cheers are deleted automatically after 14 days.</li>
      <li><b>Points:</b> if your teacher uses the points game, the points and short reasons they give you.</li>
      <li><b>On your device:</b> the app keeps your login session, a few preferences and the state of a running Session Timer in your browser or app storage. We do not use advertising or tracking cookies.</li>
    </ul>

    <h2>2. How we use it</h2>
    <p>We use this information only to run the app: to save your practice, show your progress and streaks, run groups and challenges, keep accounts secure, and answer support requests. We do not sell it, we do not show ads, we do not use analytics or tracking tools, and we do not build advertising profiles.</p>

    <h2>3. Who can see your information</h2>
    <ul>
      <li><b>You</b> can see all of your own information.</li>
      <li><b>Members of the same group</b> can see your practice days, time practiced, what you practiced, and your Skill Trainer progress. Your notes are private: only you and your teacher can see them.</li>
      <li><b>Your teacher</b> (the administrator of your group) can see the practice information of their students and can give points.</li>
      <li><b>Service providers</b> that run the app for us: our database and login provider (Supabase) and our web hosting provider. They only handle data to provide the service. If you choose Google sign-in, Google handles that login. The app&apos;s fonts are served from our own site, so no font provider sees your visit.</li>
      <li><b>Anyone else</b> only if the law requires us to share it.</li>
    </ul>

    <h2>4. Children</h2>
    <p>DrumSkills is used by drum students of all ages, including children, who practice with a teacher or a parent. In many countries a parent or guardian must give permission for a child to have an account (for example under 13 in the United States, and under 16 in the Netherlands and much of Europe). Accounts for children below that age must be created by a parent or guardian, or by the child&apos;s teacher with the parent&apos;s permission, and whoever creates the account confirms this when signing up. We keep the information we collect from children to what the app needs: a name (a first name or nickname is enough), an email address and their practice information. We never use children&apos;s information for advertising, tracking or profiling, and we never sell it.</p>
    <p>A parent or guardian can ask us at any time to show, correct or delete their child&apos;s information by writing to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or can delete the account directly in the app. The app has no chat. Parents and teachers should be aware that group names, challenges and the names and practice of group members are visible to the other members of the group.</p>

    <h2>5. Why we may use your information, and your rights</h2>
    <p>We use your information because it is needed to provide the app you signed up for (the &quot;performance of a contract&quot;), and, for keeping the service safe and working, because of our legitimate interest in doing so. Where a parent or guardian gives permission for a child&apos;s account, we rely on that permission.</p>
    <p>You have the right to ask us for a copy of your information, to correct it, to delete it, to limit or object to how we use it, and to receive it in a portable form. Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will answer within one month. If you believe we handle your information wrongly, you can also complain to the Dutch data protection authority, the Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl), or to the authority in your own country.</p>

    <h2>6. Keeping and deleting your information</h2>
    <p>We keep your information while your account exists. You can permanently delete your account and all of your practice information at any time in the app under Settings, Delete account, or by writing to us.</p>

    <h2>7. Security</h2>
    <p>Information travels over encrypted connections, and the database is set up so that each person can only read what is described in section 3. No system is perfectly secure, so please choose a strong password and do not share it.</p>

    <h2>8. Where information is processed</h2>
    <p>Our providers may store and process information in countries other than your own. When information leaves the European Economic Area, it is protected by the safeguards the GDPR requires, such as the European Commission&apos;s standard contractual clauses.</p>

    <h2>9. Changes</h2>
    <p>If we change this policy in a meaningful way we will update the date above and, where it matters, tell you in the app.</p>

    <h2>10. Contact</h2>
    <p>DrumSkills (David Gonzalez, the Netherlands), <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
  </LegalShell>;
}
