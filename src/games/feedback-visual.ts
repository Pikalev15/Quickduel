import type { RecallRoundFeedback } from "./recall-rounds";
export function recallInsight(f: RecallRoundFeedback): string {
 if(f.kind==="frequency"){
  if(f.guessHz===null)return "No answer was locked.";
  if(f.direction==="exact")return "Exact pitch. Nothing to adjust.";
  const cents=Math.abs(f.centsError??0);
  return `Your pitch was ${cents.toFixed(0)} cents ${f.direction}. ${cents<100?"A small adjustment would bring it closer.":"Try comparing the pitch in smaller steps."}`;
 }
 if(!f.guess)return "No answer was locked.";
 const differences=[{v:f.lightnessDifference??0,scale:55,high:"lighter",low:"darker"},{v:f.chromaDifference??0,scale:28,high:"more saturated",low:"less saturated"},{v:f.hueDifference??0,scale:180,high:"shifted clockwise in hue",low:"shifted counterclockwise in hue"}].sort((a,b)=>Math.abs(b.v/b.scale)-Math.abs(a.v/a.scale));
 const d=differences[0];
 return d.v===0?"Exact reconstruction. Nothing to adjust.":`Your guess was ${d.v>0?d.high:d.low}. That was the largest difference from the target.`;
}
export function pitchPosition(hz:number){return Math.max(0,Math.min(100,100*Math.log2(Math.max(120,hz)/120)/Math.log2(2000/120)));}
export function roundScores(details?:Record<string,number|string|boolean>|null){return Array.from({length:5},(_,i)=>{const v=details?.[`round${i+1}Score`];return {score:typeof v==="number"&&Number.isFinite(v)?Math.max(0,Math.min(10,v)):null,answered:details?.[`round${i+1}Answered`]!==false};});}
