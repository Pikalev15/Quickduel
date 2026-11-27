"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ProductHeader} from "@/components/ui/product-header";
import {LockAnswerButton} from "@/components/game/lock-answer-button";
import {loadSupabaseBrowserClient} from "@/lib/supabase/lazy-client";
import {estimateServerClockOffset} from "@/lib/game-clock";
import {DAILY_DURATION_MS,dailyKindLabel,type DAILY_ROTATION} from "@/games/daily-duel";
type Puzzle={sequence:string[];options:string[];dots?:{x:number;y:number;r:number}[]};
type Status="active"|"complete"|"expired";
type Overview={date:string;gameLabel?:string;weekly?:{week:string;leaderboard:{rank:number;name:string;score:number;days:number}[]}|null;durationMs:number;leaderboard:{name:string;score:number;rank:number}[];attempt:{status:Status;score:number|null}|null};
type Attempt={date:string;status:Status;score?:number|null;deadline?:string;challenge?:{puzzles:Puzzle[];kind?:typeof DAILY_ROTATION[number]};serverReceivedAt?:string;serverNow?:string};
async function dailyFetch<T>(body?:object):Promise<T>{
 const response=await fetch("/api/daily",{cache:"no-store",...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw new Error(data.error?.message??"Daily Duel is unavailable.");return data.data as T;
}
export function DailyDuelScreen(){
 const [overview,setOverview]=useState<Overview|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null);
 const [answers,setAnswers]=useState<(number|null)[]>(Array(6).fill(null)),[remaining,setRemaining]=useState(DAILY_DURATION_MS);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const inFlight=useRef(false),offset=useRef(0),lastAnswers=useRef<(number|null)[]>(Array(6).fill(null));
 const refresh=useCallback(async()=>{try{setOverview(await dailyFetch<Overview>());}catch(e){setError(e instanceof Error?e.message:"Daily Duel unavailable.");}},[]);
 useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>window.clearTimeout(timer);},[refresh]);
 async function start(){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError(null);
  try{
   const client=await loadSupabaseBrowserClient();
   if(client){const session=await client.auth.getSession();if(!session.data.session){const {error}=await client.auth.signInAnonymously();if(error)throw error;}const profile=await client.rpc("ensure_profile");if(profile.error)throw profile.error;}
   const sent=Date.now(),next=await dailyFetch<Attempt>({action:"start"});
   offset.current=estimateServerClockOffset(next.serverNow,sent,Date.now(),next.serverReceivedAt)??0;
   if(next.deadline)setRemaining(Math.max(0,Date.parse(next.deadline)-Date.now()-offset.current));
   lastAnswers.current=Array(6).fill(null);setAnswers(lastAnswers.current);setAttempt(next);
  }catch(e){setError(e instanceof Error?e.message:"Could not start Daily Duel.");}finally{inFlight.current=false;setBusy(false);}
 }
 const submit=useCallback(async(date:string)=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError(null);
  try{setAttempt(await dailyFetch<Attempt>({action:"submit",date,answers:lastAnswers.current}));void refresh();}
  catch(e){setError(e instanceof Error?e.message:"Could not submit. Try again.");}
  finally{inFlight.current=false;setBusy(false);}
 },[refresh]);
 useEffect(()=>{
  if(attempt?.status!=="active"||!attempt.deadline)return;
  const deadline=Date.parse(attempt.deadline);
  const timer=window.setInterval(()=>setRemaining(Math.max(0,deadline-Date.now()-offset.current)),50);
  return()=>window.clearInterval(timer);
 },[attempt]);
 useEffect(()=>{
  if(attempt?.status!=="active"||remaining>0||error)return;
  const timer=window.setTimeout(()=>void submit(attempt.date),0);
  return()=>window.clearTimeout(timer);
 },[attempt,remaining,error,submit]);
 const active=attempt?.status==="active",status=attempt?.status??overview?.attempt?.status;
 const score=attempt?.status==="complete"?attempt.score:overview?.attempt?.score;
 const answered=answers.filter(v=>v!==null).length;
 return <main className="min-h-screen"><ProductHeader/><section className="page-shell qd-daily-screen">
 <p className="game-kicker">{overview?.date??"Daily challenge"} · UTC · Unranked</p><h1 className="display">Daily Duel</h1><p>Six shared puzzles. One scored attempt. A new challenge every day.</p>
 {error&&<p role="alert" className="calm-error">{error}</p>}
 {active&&attempt?<section aria-label="Daily patterns"><h2>{dailyKindLabel(attempt.challenge?.kind??"pattern_complete")}</h2><p>{attempt.challenge?.kind==="odd_one_out"?"Choose the symbol that appears only once.":attempt.challenge?.kind==="colour_match"?"Choose the colour closest to the reference swatch.":attempt.challenge?.kind==="dot_estimate"?"Estimate how many dots are in each field.":"Choose the missing item in each sequence."}</p>
  <div className="qd-daily-status"><strong>{answered}/6 answered</strong><strong aria-label="Time remaining">{(remaining/1000).toFixed(1)}s</strong></div>
  <div className="game-time-progress"><span style={{transform:`scaleX(${Math.min(1,remaining/DAILY_DURATION_MS)})`}}/></div>
  <div className="pattern-list">{attempt.challenge?.puzzles.map((puzzle,index)=><section key={index} aria-label={`Pattern ${index+1}`}>{attempt.challenge?.kind==="colour_match"?<div className="qd-daily-colour-reference" role="img" aria-label="Reference colour" style={{background:puzzle.sequence[0]}}/>:attempt.challenge?.kind==="dot_estimate"?<div className="qd-daily-dot-field" role="img" aria-label="Dot field">{puzzle.dots?.map((dot,i)=><i key={i} style={{left:`${dot.x}%`,top:`${dot.y}%`,width:dot.r*2,height:dot.r*2}}/>)}</div>:<div className="pattern-sequence">{puzzle.sequence.map((symbol,i)=><span key={i}>{symbol}</span>)}</div>}<div className="pattern-options">{puzzle.options.map((symbol,i)=><button type="button" key={i} disabled={busy||remaining<=0} aria-label={attempt.challenge?.kind==="colour_match"?`Puzzle ${index+1}: swatch ${i+1}`:`Puzzle ${index+1}: ${symbol}`} aria-pressed={answers[index]===i} className={answers[index]===i?"is-selected":""} onClick={()=>{const next=[...lastAnswers.current];next[index]=i;lastAnswers.current=next;setAnswers(next);}}>{attempt.challenge?.kind==="colour_match"?<span className="qd-daily-colour-option" style={{background:symbol}} aria-hidden="true"/>:symbol}</button>)}</div></section>)}</div>
  <LockAnswerButton label="Submit daily result" disabled={busy} pending={busy} remainingMs={remaining} onClick={()=>void submit(attempt.date)}/>
 </section>:status==="complete"?<section className="qd-daily-result" aria-label="Daily result"><span>Your score</span><strong>{score}/6</strong><p>Result locked. Come back after the next UTC midnight.</p><button className="calm-secondary" type="button" onClick={()=>{const text=`QuickDuel Daily Duel ${attempt?.date??overview?.date}: ${score}/6. ${location.origin}/daily`;if(navigator.share)void navigator.share({title:"Daily Duel",text}).catch(()=>{});else void navigator.clipboard.writeText(text).catch(()=>{});}}>Share score</button></section>:status==="expired"?<p>Today’s attempt expired. A new challenge opens at midnight UTC.</p>:<div className="qd-daily-start"><p>Today: {overview?.gameLabel??"Pattern Complete"}. You have 45 seconds; unanswered puzzles score zero. Starting records your single attempt.</p><button className="calm-primary" type="button" onClick={()=>void start()} disabled={busy||!overview}>{busy?"Starting…":status==="active"?"Resume today’s attempt":"Start daily challenge"}</button></div>}
 {!active&&<section aria-label="Daily leaderboard"><div className="qd-daily-status"><h2>Today’s leaderboard</h2><button type="button" className="calm-secondary" onClick={()=>void refresh()}>Refresh</button></div>
 {!overview?<p>Leaderboard unavailable.</p>:overview.leaderboard.length===0?<p>No completed attempts yet.</p>:<table className="qd-daily-table"><thead><tr><th>Rank</th><th>Player</th><th>Score</th></tr></thead><tbody>{overview.leaderboard.map((row,index)=><tr key={index}><td>{row.rank}</td><td>{row.name}</td><td>{row.score}/6</td></tr>)}</tbody></table>}<p className="qd-daily-note">Top 100 results. Equal scores share a rank. This does not affect Elo.</p></section>}
 {!active&&overview?.weekly&&<section aria-label="Weekly daily tournament"><h2>Weekly Daily Tournament</h2><p>Week of {overview.weekly.week} · Total correct answers across this week’s daily challenges. No Elo changes.</p><table className="qd-daily-table"><thead><tr><th>Rank</th><th>Player</th><th>Points</th></tr></thead><tbody>{overview.weekly.leaderboard.map((row,i)=><tr key={i}><td>{row.rank}</td><td>{row.name} <small>({row.days} days)</small></td><td>{row.score}/42</td></tr>)}</tbody></table>{overview.weekly.leaderboard.length===0&&<p>No results this week.</p>}</section>}
 <Link className="calm-secondary" href="/seasons">Ranked weekly season</Link><Link className="calm-secondary" href="/">Home</Link></section></main>;
}
