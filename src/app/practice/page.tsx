import {PracticeRecommendation} from "@/components/game/practice-recommendation";
import {gameCatalog,practiceGameCatalog} from "@/games/catalog";
import {PRACTICE_DIFFICULTIES,practiceDifficultyDescription} from "@/games/practice-difficulty";
import {ProductHeader} from "@/components/ui/product-header";
import Link from "next/link";
export const dynamic="force-dynamic";
export default async function PracticePage({searchParams}:{searchParams:Promise<{game?:string}>}){
 const {game}=await searchParams;
 const all=[...gameCatalog,...practiceGameCatalog],selected=all.find(g=>g.id===game)??all[0];
 const seed=crypto.randomUUID();
 return <main className="min-h-screen"><ProductHeader/><section className="page-shell qd-practice-setup">
 <p className="game-kicker">Practice · no rating changes</p><h1 className="display">Choose your challenge.</h1>
 <form action="/practice" method="get" className="qd-practice-game-select"><label htmlFor="practice-game">Game</label><select id="practice-game" name="game" defaultValue={selected.id}>{all.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><button className="calm-secondary" type="submit">Choose game</button></form>
 <h2>{selected.name}</h2><p>{selected.description}</p>
 <PracticeRecommendation game={selected.id} seed={seed}/>
 <div className="qd-difficulty-grid">{PRACTICE_DIFFICULTIES.map(tier=><Link className="qd-difficulty-option" key={tier} href={`/match/practice?game=${selected.id}&seed=${seed}&difficulty=${tier}`}><span>{tier==="easy"?"Learn the controls":tier==="standard"?"Match the standard":"Test your limits"}</span><strong>{tier[0].toUpperCase()+tier.slice(1)}</strong><p>{practiceDifficultyDescription(selected.id,tier)}</p><b>Play {tier}</b></Link>)}</div>
 <p>Practice difficulty can be overridden. Ranked timing is selected by the shared skill bracket after placements.</p>
 </section></main>;
}
