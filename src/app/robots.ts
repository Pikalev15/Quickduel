import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/leaderboard", "/privacy", "/terms", "/share/"],
      disallow: ["/admin", "/api/", "/auth/", "/friends", "/history", "/match/", "/play", "/profile/", "/seasons/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
