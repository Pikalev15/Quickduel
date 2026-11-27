/** Original practice clues; not sourced from another publisher.
 * Keep this version's bank stable for deterministic historical seeds. */
export type CrypticClue = {
  clue: string;
  answer: string;
  hints: readonly [string, string];
  explanation: string;
};

export const CRYPTIC_CLUES: readonly CrypticClue[] = [
  { clue: "Quiet when LISTEN is rearranged (6)", answer: "SILENT", hints: ["The definition is quiet.", "Anagram: rearrange LISTEN."], explanation: "SILENT means quiet. The letters of LISTEN are rearranged." },
  { clue: "Fruit from PEARL without L (4)", answer: "PEAR", hints: ["The definition is fruit.", "Remove L from PEARL."], explanation: "PEARL minus L gives PEAR, a fruit." },
  { clue: "Animal concealed in education (3)", answer: "CAT", hints: ["The definition is animal.", "Look for consecutive letters inside education."], explanation: "edu[CAT]ion contains CAT." },
  { clue: "Sweet courses from reorganised STRESSED (8)", answer: "DESSERTS", hints: ["The definition is sweet courses.", "Rearrange STRESSED."], explanation: "DESSERTS is an anagram of STRESSED." },
  { clue: "Ocean hidden in house aboard (3)", answer: "SEA", hints: ["The definition is ocean.", "Look across the boundary between house and aboard."], explanation: "hou[SE A]board hides SEA." },
  { clue: "Rodent returned from TAR (3)", answer: "RAT", hints: ["The definition is rodent.", "Reverse TAR."], explanation: "TAR backwards gives RAT." },
  { clue: "Celestial body formed from starts of Sunny Trees And Rivers (4)", answer: "STAR", hints: ["The definition is celestial body.", "Use the first letters of the four capitalised words."], explanation: "Sunny, Trees, And, Rivers supply S T A R." },
  { clue: "Line concealed in tomorrow (3)", answer: "ROW", hints: ["The definition is line.", "Look at consecutive letters near the end of tomorrow."], explanation: "tomor[ROW] contains ROW, meaning a line." },
  { clue: "Part of a flower hidden in carpet alignment (5)", answer: "PETAL", hints: ["The definition is part of a flower.", "Find a word spanning the boundary of carpet and alignment."], explanation: "car[PET AL]ignment hides PETAL." },
  { clue: "Soil from mixed HEART (5)", answer: "EARTH", hints: ["The definition is soil.", "Rearrange HEART."], explanation: "EARTH means soil or our planet and is an anagram of HEART." },
  { clue: "Musical instrument from a pin and O, mixed (5)", answer: "PIANO", hints: ["The definition is musical instrument.", "Rearrange A PIN and O."], explanation: "A PIN and O rearrange to PIANO." },
  { clue: "Beginning hidden in east artist (5)", answer: "START", hints: ["The definition is beginning.", "Read across east artist."], explanation: "ea[ST ART]ist hides START." },
] as const;

export const normalizeCrypticAnswer = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, "");
