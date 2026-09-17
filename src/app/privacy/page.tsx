import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/product-header";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How QuickDuel handles accounts, match data, analytics, sharing, and deletion.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <ProductHeader />
      <article className="page-shell legal-shell">
        <p className="calm-eyebrow">Effective September 17, 2026</p>
        <h1>Privacy policy</h1>
        <p>QuickDuel collects only the information needed to operate accounts, multiplayer matches, safety controls, and coarse product analytics.</p>

        <h2>Information we process</h2>
        <p>Account data may include a display name, public player code, rating, match record, selected cosmetics, and an email or provider identifier when Google sign-in is connected. Anonymous play uses a Supabase account stored in the browser.</p>
        <p>Match records include participants, game type, validated score, trusted timing, outcome, and integrity state. Challenge seeds, answers, enforcement records, private messages, friend relationships, and provider credentials are not public.</p>

        <h2>Analytics</h2>
        <p>First-party analytics may record a random session identifier, event name, coarse device class, referrer category, game or playlist reference, and duration. QuickDuel does not collect advertising identifiers, fingerprints, raw keystrokes, pointer traces, audio, or challenge answers. Analytics can be disabled in Profile settings.</p>

        <h2>Storage and cookies</h2>
        <p>Authentication uses essential Supabase session cookies. Local and session storage remember theme, interface, queue safety, onboarding, analytics preference, and anonymous-session state. QuickDuel does not use third-party advertising cookies.</p>

        <h2>Sharing and disclosure</h2>
        <p>A completed result is public only when a player deliberately creates a share link. Service providers may process data solely to host the application, authenticate players, store records, or protect the service. QuickDuel does not sell personal information.</p>

        <h2>Deletion and retention</h2>
        <p>Account deletion is available in Profile settings and is irreversible. It removes authentication access, anonymizes public identity, and removes social relationships while retaining non-identifying match records needed for competitive integrity. Operational and analytics records are retained only as needed for the purposes described here and may be removed or aggregated.</p>

        <h2>Contact</h2>
        <p>Privacy questions and deletion issues can be filed through the project&apos;s <a href="https://github.com/Pikalev15/Quickduel/issues">public support tracker</a>. Do not include credentials, private match payloads, or sensitive personal information in a public issue.</p>

        <nav className="legal-links"><Link href="/terms">Terms</Link><Link href="/">Home</Link></nav>
      </article>
    </main>
  );
}
