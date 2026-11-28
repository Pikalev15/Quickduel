export function canRankPrivateDuel({
  selectionKind,
  gameRanked,
  playlist,
  workshop,
  linked,
}: {
  selectionKind: "game" | "playlist";
  gameRanked: boolean;
  playlist: string;
  workshop: boolean;
  linked: boolean;
}): boolean {
  return linked && !workshop && (
    selectionKind === "game" ? gameRanked : playlist !== "experimental"
  );
}
