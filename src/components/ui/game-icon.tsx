import type { ReactNode } from "react";
import type { GameId } from "@/games/types";

const grid = <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" stroke="none"/><rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="14" width="7" height="7" rx="1"/></>;
const wave = <path d="M2 12h2c2 0 2-8 4-8s2 16 4 16 2-16 4-16 2 8 4 8h2"/>;
const palette = <><circle cx="9" cy="9" r="5"/><circle cx="15" cy="9" r="5"/><circle cx="12" cy="15" r="5"/><path d="M12 10.5 14 13l-2 3-2-3z" fill="currentColor" stroke="none"/></>;
const icons: Record<GameId, ReactNode> = {
  memory_grid:grid,
  memory_grid_v2:<>{[0,1,2].flatMap(row=>[0,1,2].map(col=><rect key={row*3+col} x={3+col*6.5} y={3+row*6.5} width="5" height="5" rx=".6" fill={[1,3,5,7].includes(row*3+col)?"currentColor":"none"} />))}</>,
  frequency_recall:wave, frequency_recall_v2:wave,
  colour_recall:palette, colour_recall_v2:palette,
  time_recall:<><circle cx="12" cy="13" r="8"/><path d="M12 13V8m0 5 4 2M9 2h6m-3 0v3"/></>,
  shape_recall:<><path d="m12 3 8 5 1 10-9 3-9-3 1-10z"/><path d="m12 3 0 18M4 8l16 10M20 8 3 18" strokeOpacity=".4"/></>,
  rhythm_recall:<><path d="M3 15v-6m4 10V5m5 12V7m5 13V4m4 12V8"/></>,
  dot_estimate:<>{[[4,5],[13,4],[20,8],[8,11],[16,13],[3,18],[11,20],[21,19]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="1.65" fill="currentColor" stroke="none"/>)}</>,
  number_order:<><path d="M4 6h4m-2-2v4M4 17h4M4 20h4M4 11h4M13 19V5m-4 4 4-4 4 4M18 19h3"/></>,
  odd_one_out:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="m17.5 13 4.5 4.5-4.5 4.5-4.5-4.5z" fill="currentColor" stroke="none"/></>,
  pattern_complete:<><circle cx="5" cy="7" r="2.5"/><rect x="10" y="4.5" width="5" height="5" rx=".5"/><circle cx="19.5" cy="7" r="2.5"/><rect x="2.5" y="14" width="5" height="5" rx=".5"/><circle cx="12.5" cy="16.5" r="2.5"/><rect x="17" y="14" width="5" height="5" rx=".5" strokeDasharray="1.5 2"/></>,
  typing_sprint:<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10"/></>,
  reaction_test:<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>,
  target_tap:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
  cryptic_duel:<><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6 10h4m-4 4h3M15 10a2 2 0 1 1 3 1.8c-1 .5-1.5 1-1.5 2M16.5 16h.01"/></>,
};

export function GameIcon({ game }: { game: GameId }) {
  return <svg data-game-icon={game} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[game]}</svg>;
}
