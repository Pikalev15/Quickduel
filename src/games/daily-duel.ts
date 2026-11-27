import {z} from "zod";
import {getGame} from "./registry";
export const DAILY_DURATION_MS=45000;
export const DAILY_GAME="pattern_complete" as const;
export const dailyDate=(now:Date=new Date())=>now.toISOString().slice(0,10);
export const dailyDateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const time=Date.parse(s+"T00:00:00Z");return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===s;});
export const dailyAnswersSchema=z.array(z.number().int().min(0).max(3).nullable()).length(6);
export const dailyRequestSchema=z.discriminatedUnion("action",[z.object({action:z.literal("start")}).strict(),z.object({action:z.literal("submit"),date:dailyDateSchema,answers:dailyAnswersSchema}).strict()]);
export function dailyPublicChallenge(seed:string){const game=getGame(DAILY_GAME);return game.publicChallenge(game.generate(seed),"answer");}
export function scoreDaily(seed:string,answers:(number|null)[]){
 const puzzles=getGame(DAILY_GAME).generate(seed).puzzles as {options:string[];answer:string}[];
 return puzzles.reduce((sum,puzzle,index)=>sum+(answers[index]!==null&&puzzle.options[answers[index]!]===puzzle.answer?1:0),0);
}
export function dailyLeaderboard(rows:{name:string;score:number}[]){
 let rank=0,last:number|null=null;
 return [...rows].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).map((row,i)=>{if(row.score!==last){rank=i+1;last=row.score;}return {...row,rank};});
}
