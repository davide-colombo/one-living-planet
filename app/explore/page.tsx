import type { Metadata } from "next";
import { ExploreClient } from "./explore-client";

export const metadata: Metadata = {
  title: "Explore · Earth Explorer",
  description: "Touch any place on the planet and meet the ecoregion that lives there.",
};

export default function ExplorePage() {
  return <ExploreClient />;
}
