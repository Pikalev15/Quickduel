import type { Metadata } from "next";
import Link from "next/link";
import { ProductHeader } from "@/components/ui/product-header";
import { ArrowIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Arena not found",
  description: "The requested QuickDuel page or arena could not be found.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="min-h-screen">
      <ProductHeader />
      <section className="page-shell qd-not-found">
        <div className="qd-404-art" aria-hidden="true"><span>4</span><div className="qd-404-grid">{Array.from({ length: 16 }, (_, i) => <i key={i} data-lit={[0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15].includes(i) ? "true" : undefined} />)}</div><span>4</span></div>
        <p className="calm-eyebrow">404 · Arena not found</p>
        <h1>Missed that one.</h1>
        <p>This page or duel link could not be found.</p>
        <div className="feature-actions">
          <Link className="calm-primary" href="/">Return home <ArrowIcon className="h-4 w-4" /></Link>
          <Link className="calm-secondary" href="/match/practice?game=memory_grid">Play a practice round</Link>
        </div>
      </section>
    </main>
  );
}
