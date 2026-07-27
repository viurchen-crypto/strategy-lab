import type { Metadata } from "next";
import { Learn } from "./learn";

export const metadata: Metadata = {
  title: "Learn · Strategy Lab",
  description:
    "A glossary of the technical vocabulary, the strategy catalog and its published references, and a tutor that answers about both.",
};

export default function LearnPage() {
  return <Learn />;
}
