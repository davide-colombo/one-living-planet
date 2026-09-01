import type { Metadata } from "next";
import { StyleguideClient } from "./styleguide-client";

export const metadata: Metadata = {
  title: "Styleguide · Earth Explorer",
  description: "Design tokens: solar palettes, typography, spacing, and motion.",
};

export default function StyleguidePage() {
  return <StyleguideClient />;
}
