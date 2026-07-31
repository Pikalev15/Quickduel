export const DIVISIONS = [
  { id: "bronze", name: "Bronze", minimumRating: 100, mark: "B" },
  { id: "silver", name: "Silver", minimumRating: 800, mark: "S" },
  { id: "gold", name: "Gold", minimumRating: 1_000, mark: "G" },
  { id: "platinum", name: "Platinum", minimumRating: 1_200, mark: "P" },
  { id: "diamond", name: "Diamond", minimumRating: 1_400, mark: "D" },
  { id: "master", name: "Master", minimumRating: 1_600, mark: "M" },
] as const;

export type DivisionId = (typeof DIVISIONS)[number]["id"];
export type Division = (typeof DIVISIONS)[number] & {
  next: (typeof DIVISIONS)[number] | null;
  progress: number;
  ratingToNext: number | null;
};

export function getDivision(rating: number): Division {
  const safeRating = Math.max(100, Math.min(4_000, Math.round(rating)));
  let index = 0;
  for (let candidate = 0; candidate < DIVISIONS.length; candidate += 1) {
    if (safeRating >= DIVISIONS[candidate].minimumRating) index = candidate;
  }
  const current = DIVISIONS[index];
  const next = DIVISIONS[index + 1] ?? null;
  const progress = next
    ? (safeRating - current.minimumRating) /
      (next.minimumRating - current.minimumRating)
    : 1;
  return {
    ...current,
    next,
    progress: Math.max(0, Math.min(1, progress)),
    ratingToNext: next ? Math.max(0, next.minimumRating - safeRating) : null,
  };
}

export function getDivisionChange(before: number, after: number) {
  const previous = getDivision(before);
  const current = getDivision(after);
  if (previous.id === current.id) return "none" as const;
  return after > before ? ("promotion" as const) : ("demotion" as const);
}
