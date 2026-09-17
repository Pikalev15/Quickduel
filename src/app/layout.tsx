import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "QuickDuel — fast multiplayer perception games",
    template: "%s · QuickDuel",
  },
  description:
    "Play thirteen short, fair, server-authoritative perception games against other players.",
  applicationName: "QuickDuel",
  icons: {
    icon: "/icon.svg",
    apple: "/brand/quickduel-google-120.png",
  },
  openGraph: {
    title: "QuickDuel - fast multiplayer perception games",
    description: "Play thirteen short, fair perception games against other players.",
    siteName: "QuickDuel",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "QuickDuel arena" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "QuickDuel - fast multiplayer perception games",
    description: "Play thirteen short, fair perception games against other players.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#171816" },
  ],
};

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem("quickduel:theme");
    const preference = stored === "dark" || stored === "system" ? stored : "light";
    const resolved = preference === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
