import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Strategy Lab",
  description:
    "A research terminal that backtests twenty published trading strategies on real historical market data.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070a0d" },
    { media: "(prefers-color-scheme: light)", color: "#f2f5f7" },
  ],
};

/**
 * Appearance is resolved before first paint. Reading the stored preference in a
 * React effect instead would flash the wrong theme on every page load, which on
 * a full-bleed dark app is a strobe rather than a nuance.
 */
const BOOTSTRAP = `(function(){try{
var t=localStorage.getItem("sl-theme");
var d=localStorage.getItem("sl-density");
if(!t||t==="system"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}
document.documentElement.dataset.theme=t;
document.documentElement.dataset.density=d||"default";
}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-density="default"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
