import type { Metadata } from "next";
import { LegalShell, SUPPORT_EMAIL } from "../legal-shell";

export const metadata: Metadata = { title: "Terms of Use | Drum Progress", robots: { index: false } };

export default function TermsPage() {
  return <LegalShell title="Terms of Use">
    <p>These terms apply when you use Drum Progress. By creating an account or using the app you agree to them. If you are under the age of 18, please read them together with a parent or guardian. If you are under 16, a parent or guardian (or your teacher, with your parent&apos;s permission) must create the account and agree to these terms on your behalf.</p>

    <h2>1. Your account</h2>
    <p>Give accurate information, keep your password private, and tell us if you think someone else has used your account. You are responsible for what happens under your account.</p>

    <h2>2. Using the app</h2>
    <ul>
      <li>Use the app for practicing and tracking music. Enter your real practice honestly.</li>
      <li>Be kind in groups. Do not write anything rude, threatening, private about someone else, or unsuitable for children in your notes, names or challenges.</li>
      <li>Do not try to break the app, get into other people&apos;s accounts, or change results such as practice time or points unfairly.</li>
    </ul>

    <h2>3. Groups and teachers</h2>
    <p>A group&apos;s administrator (usually a teacher) can see the practice information of the group&apos;s members, manage group settings, and give points. Members of a group can see each other&apos;s practice. Your notes stay private to you and your teacher. Only join groups you know.</p>

    <h2>4. Your content</h2>
    <p>The notes and other things you enter remain yours. You allow us to store and show them inside the app as described in the Privacy Policy. We may remove content that breaks these terms.</p>

    <h2>5. Ending your account</h2>
    <p>You can delete your account at any time in Settings. We may suspend or close accounts that break these terms.</p>

    <h2>6. No promises about results</h2>
    <p>Drum Progress is provided as is. We work hard to keep it reliable, but we cannot promise it will always be available or error free, and we are not responsible for lost practice records beyond what the law requires. The app is a practice aid and not a replacement for a teacher.</p>

    <h2>7. Changes</h2>
    <p>We may update these terms. If we make an important change we will update the date above and tell you in the app where it matters.</p>

    <h2>8. Contact</h2>
    <p><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
  </LegalShell>;
}
