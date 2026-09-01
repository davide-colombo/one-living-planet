/**
 * Facts shown in the focused-body view. Values are rounded the way a
 * person would say them; sources are the NASA planetary fact sheets.
 */

export interface BodyFacts {
  title: string;
  kind: string;
  rows: Array<[string, string]>;
  note: string;
}

export const BODY_FACTS: Record<string, BodyFacts> = {
  sun: {
    title: "The Sun",
    kind: "Star",
    rows: [
      ["Distance from Earth", "150 million km"],
      ["Surface temperature", "5,500 °C"],
      ["Gravity", "274 m/s²"],
      ["Mass", "333,000 × Earth"],
      ["Share of the system's mass", "99.86%"],
    ],
    note: "Every second it turns about four million tonnes of itself into light.",
  },
  mercury: {
    title: "Mercury",
    kind: "Planet",
    rows: [
      ["Distance from the Sun", "58 million km"],
      ["Temperature", "-173 to 427 °C"],
      ["Gravity", "3.7 m/s²"],
      ["Mass", "0.06 × Earth"],
      ["A year", "88 days"],
      ["Moons", "0"],
    ],
    note: "A single solar day on Mercury lasts two of its years.",
  },
  venus: {
    title: "Venus",
    kind: "Planet",
    rows: [
      ["Distance from the Sun", "108 million km"],
      ["Average temperature", "464 °C"],
      ["Gravity", "8.9 m/s²"],
      ["Mass", "0.82 × Earth"],
      ["A day", "243 Earth days"],
      ["Moons", "0"],
    ],
    note: "The hottest planet of all, and it spins backwards.",
  },
  earth: {
    title: "Earth",
    kind: "Planet",
    rows: [
      ["Distance from the Sun", "150 million km"],
      ["Average temperature", "15 °C"],
      ["Gravity", "9.8 m/s²"],
      ["A day", "23.9 hours"],
      ["A year", "365.25 days"],
      ["Moons", "1"],
    ],
    note: "The only place where anyone is known to live.",
  },
  mars: {
    title: "Mars",
    kind: "Planet",
    rows: [
      ["Distance from the Sun", "228 million km"],
      ["Average temperature", "-63 °C"],
      ["Gravity", "3.7 m/s²"],
      ["Mass", "0.11 × Earth"],
      ["A day", "24.6 hours"],
      ["Moons", "2"],
    ],
    note: "Olympus Mons rises three times higher than Everest.",
  },
  jupiter: {
    title: "Jupiter",
    kind: "Planet",
    rows: [
      ["Distance from the Sun", "778 million km"],
      ["Cloud-top temperature", "-108 °C"],
      ["Gravity", "24.8 m/s²"],
      ["Mass", "318 × Earth"],
      ["A day", "9.9 hours"],
      ["Moons", "95"],
    ],
    note: "The Great Red Spot is a storm wider than Earth that has blown for centuries.",
  },
  saturn: {
    title: "Saturn",
    kind: "Planet",
    rows: [
      ["Distance from the Sun", "1.4 billion km"],
      ["Cloud-top temperature", "-139 °C"],
      ["Gravity", "10.4 m/s²"],
      ["Mass", "95 × Earth"],
      ["A day", "10.7 hours"],
      ["Moons", "146"],
    ],
    note: "Its density is so low that it would float, given a big enough ocean.",
  },
  uranus: {
    title: "Uranus",
    kind: "Planet",
    rows: [
      ["Distance from the Sun", "2.9 billion km"],
      ["Average temperature", "-195 °C"],
      ["Gravity", "8.9 m/s²"],
      ["Mass", "14.5 × Earth"],
      ["A year", "84 Earth years"],
      ["Moons", "28"],
    ],
    note: "It rolls around the Sun on its side, tipped over by 98 degrees.",
  },
  neptune: {
    title: "Neptune",
    kind: "Planet",
    rows: [
      ["Distance from the Sun", "4.5 billion km"],
      ["Average temperature", "-201 °C"],
      ["Gravity", "11.2 m/s²"],
      ["Mass", "17 × Earth"],
      ["A year", "165 Earth years"],
      ["Moons", "16"],
    ],
    note: "The windiest world we know: gusts pass 2,000 km/h.",
  },
};
