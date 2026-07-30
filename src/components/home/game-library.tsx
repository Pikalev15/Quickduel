import Link from "next/link";
import { gameCatalog, type GameCatalogEntry } from "@/games/catalog";
import { ArrowIcon } from "@/components/ui/icons";

const featuredIds = new Set(["memory_grid", "colour_recall", "frequency_recall"]);

export function GameLibrary({
  expanded,
  onExpand,
}: {
  expanded: boolean;
  onExpand: () => void;
}) {
  const featured = gameCatalog.filter((game) => featuredIds.has(game.id));
  return (
    <section id="game-library" className="calm-library" aria-label="Game library">
      <div className="calm-section-head">
        <div>
          <span>Suggested games</span>
          <p>Start with a familiar test, or open the full collection.</p>
        </div>
        <button type="button" onClick={onExpand} aria-controls="all-games-list" aria-expanded={expanded}>
          {expanded ? "Hide all" : "See all"}
        </button>
      </div>

      <div className="featured-games">
        {featured.map((game, index) => (
          <GameRow game={game} index={index + 1} key={game.id} />
        ))}
      </div>

      <button type="button" className="all-games-disclosure" onClick={onExpand} aria-controls="all-games-list" aria-expanded={expanded}>
        <span><b>All games</b><small>12 challenges across sensory, mind, and experimental playlists</small></span>
        <span>{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div id="all-games-list" className="all-games-list">
          {gameCatalog
            .filter((game) => !featuredIds.has(game.id))
            .map((game) => (
              <GameRow
                game={game}
                index={gameCatalog.findIndex((entry) => entry.id === game.id) + 1}
                key={game.id}
              />
            ))}
        </div>
      )}
    </section>
  );
}

function GameRow({ game, index }: { game: GameCatalogEntry; index: number }) {
  return (
    <article className="calm-game-row">
      <div className={`game-mark game-mark-${game.category}`}>{String(index).padStart(2, "0")}</div>
      <div className="calm-game-copy">
        <h3>{game.name}</h3>
        <p>{game.description}</p>
      </div>
      <div className="calm-game-tags">
        <span>{game.category}</span>
        <span>{game.ranked ? "ranked" : "unranked"}</span>
      </div>
      <div className="calm-game-actions">
        <Link href={`/match/practice?game=${game.id}&seed=first-${game.id}`}>Practice</Link>
        <Link href={`/play?playlist=${game.category}&game=${game.id}`}>
          Duel <ArrowIcon className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
