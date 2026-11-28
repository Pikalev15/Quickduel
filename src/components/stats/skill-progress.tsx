"use client";
import {useEffect,useState} from "react";
import {getGameDisplay} from "@/games/display";
import {masteryLevel} from "@/games/personal-records";
import type {GameId} from "@/games/types";
export type SkillRow={game:GameId;version:number;tier:string;revealMs:number;answerMs:number;attempts:number;recentCount:number;accuracy:number;bestScore:number;bestSummary:string;bestMatchId:string};
function useSkills(){
 const [rows,setRows]=useState<SkillRow[]|null>(null);
 useEffect(()=>{let active=true;void fetch("/api/progression",{cache:"no-store"}).then(async r=>{if(!r.ok)return;const b=await r.json();if(active&&Array.isArray(b.data))setRows(b.data);}).catch(()=>{});return()=>{active=false;};},[]);
 return rows;
}
export function SkillProgress(){
 const rows=useSkills();
 return <section className="qd-skill-progress" aria-label="Game mastery"><h2>Game mastery &amp; records</h2><p>Recent accuracy in valid ranked public matches. Each ruleset and timing has its own record; at least five results establish a mastery tier.</p>{rows===null?<p>Mastery data unavailable.</p>:rows.length===0?<p>Finish a ranked duel to establish your first record.</p>:rows.map(row=><article key={`${row.game}:${row.version}:${row.tier}:${row.revealMs}:${row.answerMs}`}><div><strong>{getGameDisplay(row.game).name}</strong><small>{row.tier} · {row.attempts} matches</small></div><span>{masteryLevel(row.accuracy,row.recentCount)} · {Math.round(row.accuracy*100)}%</span><meter min={0} max={1} value={row.accuracy} aria-label={`${getGameDisplay(row.game).name} recent accuracy`}/><small>Personal best: {row.bestSummary}</small></article>)}</section>;
}
export function RankedRecordNotice({matchId}:{matchId:string}){
 const rows=useSkills();const best=rows?.find(r=>r.bestMatchId===matchId);
 if(!best)return null;
 return <div className="qd-personal-record" data-record="true" role="status"><strong>Personal best</strong><span>{best.bestSummary}</span><small>{best.tier} timing · Same ruleset</small></div>;
}
