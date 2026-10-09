import type { ReactNode } from "react";

// Flip to false once the policy text has been reviewed and is ready to be published for real.
const IS_DRAFT = true;

export const SUPPORT_EMAIL = "practice-masters@gmail.com";
export const LEGAL_UPDATED = "09/10/2026";

export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return <main className="shell"><section className="page legal">
    <a className="page-back" href="/">‹ DrumSkills</a>
    {IS_DRAFT && <p className="legal-draft">DRAFT: not yet in effect. Being reviewed before the App Store release.</p>}
    <header className="simple-head"><p className="eyebrow">DRUMSKILLS</p><h1>{title}</h1><p className="hint legal-updated">Last updated {LEGAL_UPDATED}</p></header>
    {children}
  </section></main>;
}
