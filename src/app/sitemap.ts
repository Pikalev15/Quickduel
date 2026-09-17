import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const updated = new Date("2026-09-17");
  return [
    { url: base, lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/leaderboard`, lastModified: updated, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/duel/new`, lastModified: updated, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.2 },
  ];
}
