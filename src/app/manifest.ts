import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QuickDuel",
    short_name: "QuickDuel",
    description: "Fast, fair multiplayer perception games.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f8",
    theme_color: "#3157d5",
    icons: [
      { src: "/brand/quickduel-google-120.png", sizes: "120x120", type: "image/png" },
      { src: "/brand/quickduel-google-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
