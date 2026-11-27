import { SignalIcon } from "@/components/ui/icons";
import { Wordmark } from "@/components/ui/wordmark";
import { getDivision } from "@/lib/divisions";
import { getPlacement } from "@/lib/placements";
import { RequestBell } from "@/components/notifications/request-bell";

export function GameHeader({
  player,
  playerRating,
  opponent,
  opponentRating,
  playerMatches,
  opponentMatches,
  connected,
  practice = false,
  opponentConnected,
  showRequests = false,
}: {
  player: string;
  playerRating: number;
  opponent: string;
  opponentRating?: number;
  playerMatches?: number;
  opponentMatches?: number;
  connected: boolean;
  practice?: boolean;
  opponentConnected?: boolean | null;
  showRequests?: boolean;
}) {
  const placement = getPlacement(playerMatches);
  const otherPlacement = getPlacement(opponentMatches);
  return (
    <>
      <header className="page-shell flex h-[70px] items-center justify-between">
        <Wordmark compact />
        <div className="flex items-center gap-2">
        <span
          className={`display flex items-center gap-2 text-xs tracking-[0.1em] ${connected ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
        >
          <SignalIcon className="h-5 w-5" />
          {connected ? "Connected" : "Reconnecting"}
        </span>
        {showRequests && <RequestBell />}
        </div>
      </header>
      <div className="page-shell grid grid-cols-[1fr_auto_1fr] items-center border-y border-[var(--accent)] text-sm">
        <div className="truncate px-3 py-3 text-center sm:text-left">
          <span className="text-[var(--muted)]">YOU · </span>
          {player} · <strong className="text-[var(--accent)]">{practice ? "Practice" : placement?.placed ? playerRating : placement ? `${placement.completed}/${placement.required}` : "–"}</strong>
          {!practice && <span className="hidden text-[var(--muted)] sm:inline"> · {placement?.placed ? getDivision(playerRating).name : placement ? "Placement" : "Rank pending"}</span>}
        </div>
        <div className="display border-x border-[var(--accent)] px-3 py-2 text-xl text-[var(--accent)]">
          VS
        </div>
        <div className="truncate px-3 py-3 text-center sm:text-right">
          {opponent}
          {practice ? (
            <span className="text-[var(--muted)]"> · UNRANKED</span>
          ) : (
            <>
              {" · "}
              <strong className="text-[var(--accent)]">{otherPlacement?.placed && opponentRating !== undefined ? opponentRating : otherPlacement ? "Unranked" : "–"}</strong>
              {otherPlacement?.placed && opponentRating !== undefined && <span className="hidden text-[var(--muted)] sm:inline"> · {getDivision(opponentRating).name}</span>}
              {opponentConnected === false && (
                <span className="text-[var(--danger)]"> · OFFLINE</span>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
