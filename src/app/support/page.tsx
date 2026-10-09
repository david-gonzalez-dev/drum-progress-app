import type { Metadata } from "next";
import { LegalShell, SUPPORT_EMAIL } from "../legal-shell";

export const metadata: Metadata = { title: "Support | DrumSkills", robots: { index: false } };

export default function SupportPage() {
  return <LegalShell title="Support">
    <p>Need help with DrumSkills? Write to us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will get back to you.</p>

    <h2>Common questions</h2>
    <p><b>I forgot my password.</b> On the login screen, tap Forgot password and follow the email we send you.</p>
    <p><b>How do I delete my account?</b> Open Settings, scroll down and tap Delete account. This permanently removes your account and all of your practice information. A parent can also ask us by email to delete a child&apos;s account.</p>
    <p><b>How do I join my teacher&apos;s group?</b> Open the Group tab, tap Join with invite code and enter the code your teacher gave you.</p>
    <p><b>Something in a group is not okay.</b> If you see a name, note or challenge that is unkind or unsuitable, email us the details and we will look into it quickly.</p>
    <p><b>Something is not working.</b> Tell us what you were doing, what you expected, and what happened instead. A screenshot helps.</p>
  </LegalShell>;
}
