import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "QuickDuel — fast multiplayer perception games",
    template: "%s · QuickDuel",
  },
  description:
    "Play twelve short, fair, server-authoritative perception games against other players.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
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
