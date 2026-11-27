import Link from "next/link";
import { gameCatalog, practiceGameCatalog, type GameCatalogEntry } from "@/games/catalog";
import { ArrowIcon } from "@/components/ui/icons";
import { GameIcon } from "@/components/ui/game-icon";

const featuredIds = new Set(["memory_grid", "colour_recall_v2", "frequency_recall_v2"]);

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
          <span>Games</span>
        </div>
        <button type="button" onClick={onExpand} aria-controls="all-games-list" aria-expanded={expanded}>
          {expanded ? "Hide all" : "See all"}
        </button>
      </div>

      <div className="featured-games">
        {featured.map((game) => (
          <GameRow game={game} key={game.id} />
        ))}
      </div>

      <div className="calm-section-head"><div><span>Practice only</span></div></div>
      <div className="featured-games">
        {practiceGameCatalog.map((game) => <GameRow key={game.id} game={game} practiceOnly />)}
      </div>

      <button type="button" className="all-games-disclosure" onClick={onExpand} aria-controls="all-games-list" aria-expanded={expanded}>
        <span><b>All games</b><small>13 games</small></span>
        <span>{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div id="all-games-list" className="all-games-list">
          {gameCatalog
            .filter((game) => !featuredIds.has(game.id))
            .map((game) => (
              <GameRow
                game={game}
                key={game.id}
              />
            ))}
        </div>
      )}
    </section>
  );
}

function GameRow({ game, practiceOnly = false }: { game: GameCatalogEntry; practiceOnly?: boolean }) {
  return (
    <article className="calm-game-row">
      <div className={`game-mark game-mark-${game.category}`}><GameIcon game={game.id} /></div>
      <div className="calm-game-copy">
        <h3>{game.name}</h3>
        <p>{game.description}</p>
      </div>
      <div className="calm-game-tags">
        <span>{game.category}</span>
        <span>{practiceOnly ? "practice only" : game.ranked ? "ranked" : "unranked"}</span>
      </div>
      <div className="calm-game-actions">
        <Link href={`/match/practice?game=${game.id}&seed=first-${game.id}`}>Practice</Link>
        {!practiceOnly && <Link href={`/play?playlist=${game.category}&game=${game.id}`}>
          Duel <ArrowIcon className="h-4 w-4" />
        </Link>}
      </div>
    </article>
  );
}
