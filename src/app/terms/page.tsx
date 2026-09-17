import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/product-header";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for accounts, fair play, user conduct, and availability on QuickDuel.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <ProductHeader />
      <article className="page-shell legal-shell">
        <p className="calm-eyebrow">Effective September 17, 2026</p>
        <h1>Terms of use</h1>
        <p>By using QuickDuel, you agree to these rules. If you do not agree, do not use the service.</p>

        <h2>Accounts</h2>
        <p>You are responsible for activity on your account and for maintaining access to any linked sign-in method. Anonymous accounts may be unrecoverable if browser data is cleared before a provider is linked.</p>

        <h2>Fair play</h2>
        <p>Do not automate play, manipulate requests or timing, exploit vulnerabilities, create abusive queue traffic, collude on ranked results, or evade enforcement. QuickDuel may invalidate matches or restrict accounts to protect competitive integrity.</p>

        <h2>Conduct and content</h2>
        <p>Display names and chat must not impersonate others, threaten people, expose private information, or contain unlawful or abusive material. Reports may be reviewed and enforcement may be applied.</p>

        <h2>Scores and availability</h2>
        <p>Ratings, ranks, divisions, and gameplay statistics are entertainment features, not scientific, medical, psychological, aptitude, or intelligence assessments. The service may change, experience interruptions, or reset data during development.</p>

        <h2>Account termination</h2>
        <p>You may delete your account in Profile settings. QuickDuel may suspend access for abuse, security risk, or material violation of these terms. Non-identifying match records may remain for integrity and audit purposes.</p>

        <h2>Contact</h2>
        <p>Questions, security reports, and service issues can be filed through the project&apos;s <a href="https://github.com/Pikalev15/Quickduel/issues">support tracker</a>. Avoid placing confidential information in public issues.</p>

        <nav className="legal-links"><Link href="/privacy">Privacy policy</Link><Link href="/">Home</Link></nav>
      </article>
    </main>
  );
}
