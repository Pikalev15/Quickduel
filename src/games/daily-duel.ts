import {z} from "zod";
import {getGame} from "./registry";
import {createRandom,integer,shuffle} from "./random";
export const DAILY_DURATION_MS=45000;
export const DAILY_GAME="pattern_complete" as const;
export const dailyDate=(now:Date=new Date())=>now.toISOString().slice(0,10);
export const dailyDateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const time=Date.parse(s+"T00:00:00Z");return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===s;});
export const dailyAnswersSchema=z.array(z.number().int().min(0).max(3).nullable()).length(6);
export const dailyRequestSchema=z.discriminatedUnion("action",[z.object({action:z.literal("start")}).strict(),z.object({action:z.literal("submit"),date:dailyDateSchema,answers:dailyAnswersSchema}).strict()]);
export const DAILY_ROTATION=["pattern_complete","number_sequence","odd_one_out","colour_match","dot_estimate"] as const;
export const DAILY_LATEST_VERSION=3;
export function dailyKind(date:string,version:number){
 if(version===1)return DAILY_ROTATION[0];
 const day=Math.floor(Date.parse(date+"T00:00:00Z")/86400000);
 const length=version===2?3:DAILY_ROTATION.length;
 return DAILY_ROTATION[((day%length)+length)%length]??DAILY_ROTATION[0];
}
export function dailyKindLabel(kind:ReturnType<typeof dailyKind>){
 return kind==="number_sequence"?"Number Sequence":kind==="odd_one_out"?"Odd One Out":kind==="colour_match"?"Colour Match":kind==="dot_estimate"?"Dot Estimate":"Pattern Complete";
}
type DailyPuzzle={sequence:string[];options:string[];answer:string;dots?:{x:number;y:number;r:number}[]};
export function dailyPuzzles(seed:string,date="1970-01-01",version=1):DailyPuzzle[]{
 const kind=dailyKind(date,version);
 if(kind==="pattern_complete")return getGame(DAILY_GAME).generate(seed).puzzles as DailyPuzzle[];
 const random=createRandom(seed+":"+kind);
 return Array.from({length:6},()=>{
  if(kind==="colour_match"){
   const hue=integer(random,25,335),saturation=integer(random,55,80),lightness=integer(random,40,60);
   const swatch=(offset:number)=>`hsl(${hue+offset} ${saturation}% ${lightness}%)`;
   const direction=integer(random,0,1)?1:-1;
   const answer=swatch(direction*3);
   return {sequence:[swatch(0)],options:shuffle(random,[answer,swatch(-direction*10),swatch(direction*15),swatch(-direction*22)]),answer};
  }
  if(kind==="dot_estimate"){
   const count=integer(random,30,85),step=integer(random,7,10);
   const dots=Array.from({length:count},()=>({x:integer(random,4,96),y:integer(random,4,96),r:integer(random,2,4)}));
   return {sequence:[],dots,options:shuffle(random,[count,count-step,count+step,count+step*2].map(String)),answer:String(count)};
  }
  if(kind==="number_sequence"){
   const first=integer(random,1,24),step=integer(random,2,9),answer=first+step*4;
   return {sequence:[...Array.from({length:4},(_,i)=>String(first+step*i)),"?"],options:shuffle(random,[answer,answer-step,answer+step,answer+1].map(String)),answer:String(answer)};
  }
  const symbols=["●","■","▲","◆"],chosen=shuffle(random,symbols),index=integer(random,0,4);
  return {sequence:Array.from({length:5},(_,i)=>i===index?chosen[1]:chosen[0]),options:shuffle(random,symbols),answer:chosen[1]};
 });
}
export function dailyPublicChallenge(seed:string,date="1970-01-01",version=1){
 const puzzles=dailyPuzzles(seed,date,version).map(({sequence,options,dots})=>({sequence,options,...(dots?{dots}:{})}));
 return {puzzles,kind:dailyKind(date,version)};
}
export function scoreDaily(seed:string,answers:(number|null)[],date="1970-01-01",version=1){
 return dailyPuzzles(seed,date,version).reduce((sum,puzzle,index)=>sum+(answers[index]!==null&&puzzle.options[answers[index]!]===puzzle.answer?1:0),0);
}
export function weekStart(date:string){
 const time=new Date(date+"T00:00:00Z");time.setUTCDate(time.getUTCDate()-((time.getUTCDay()+6)%7));return dailyDate(time);
}
export function dailyLeaderboard(rows:{name:string;score:number}[]){
 let rank=0,last:number|null=null;
 return [...rows].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).map((row,i)=>{if(row.score!==last){rank=i+1;last=row.score;}return {...row,rank};});
}
