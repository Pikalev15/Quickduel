export type RequestKind = "friend" | "duel" | "rematch" | "rematch_ready";
export type PlayerRequest = {
  id: string;
  kind: RequestKind;
  sender: string;
  createdAt: string;
  expiresAt: string | null;
  detail: string;
  matchId?: string;
};
export type RequestInbox = { userId: string; requests: PlayerRequest[] };

export function requestTitle(kind: RequestKind) {
  switch (kind) {
    case "friend": return "Friend request";
    case "duel": return "Private duel invitation";
    case "rematch": return "Rematch request";
    case "rematch_ready": return "Rematch ready";
  }
}
export function activeRequests(items: PlayerRequest[], now: number, dismissed: ReadonlySet<string>) {
  return items.filter(item => !dismissed.has(item.id) && (item.expiresAt === null || Date.parse(item.expiresAt) > now));
}
