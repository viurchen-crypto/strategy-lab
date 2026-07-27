import type { Metadata } from "next";
import { Screener } from "./screener";

export const metadata: Metadata = {
  title: "Screener · Strategy Lab",
  description:
    "A technical screen of the S&P 500 and the major cryptocurrencies, computed from daily prices.",
};

export default function ScreenerPage() {
  return <Screener />;
}
