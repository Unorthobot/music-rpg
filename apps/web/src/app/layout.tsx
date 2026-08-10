import type { Metadata, Viewport } from "next";
import { brand } from "@music-rpg/shared";
import "@music-rpg/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${brand.productName} — ${brand.tagline}`,
    template: `%s · ${brand.shortName}`,
  },
  description: brand.descriptor,
};

/**
 * Every screen reads live simulation state — a career, a world, an event log —
 * so nothing in this app is prerenderable. Declaring it here keeps the build
 * from opening a database at build time.
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  // The reveal and onboarding rely on real viewport height on phones.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-surface-3 focus:px-4 focus:py-3 focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
