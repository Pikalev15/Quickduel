import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/product-header";

export const metadata: Metadata = {
  title: "Arena not found",
  description: "The requested QuickDuel page or arena could not be found.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="min-h-screen">
      <ProductHeader />
      <section className="page-shell status-page">
        <p className="calm-eyebrow">404 · Arena not found</p>
        <h1>This round does not exist.</h1>
        <p>The link may have expired, moved, or never entered the queue.</p>
        <div className="feature-actions">
          <Link className="calm-primary" href="/">Return home</Link>
          <Link className="calm-secondary" href="/duel/new">Create a private duel</Link>
        </div>
      </section>
    </main>
  );
}
