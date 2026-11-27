import {getGame} from "./registry";
import type {Challenge,GameId} from "./types";
export const PRACTICE_DIFFICULTIES=["easy","standard","expert"] as const;
export type PracticeDifficulty=typeof PRACTICE_DIFFICULTIES[number];
export function parseDifficulty(v:unknown):PracticeDifficulty{return PRACTICE_DIFFICULTIES.includes(v as PracticeDifficulty)?v as PracticeDifficulty:"standard";}
type Overrides={revealMs?:number;answerMs?:number;roundAnswerMs?:number;roundRevealMs?:number;tapWindowMs?:number;wordLength?:"short"|"long"};
const tiers:Partial<Record<GameId,{easy:Overrides;expert:Overrides}>>={
 memory_grid:{easy:{revealMs:3500,answerMs:10000},expert:{revealMs:1800,answerMs:5000}},
 memory_grid_v2:{easy:{revealMs:5500,answerMs:14000},expert:{revealMs:2800,answerMs:7000}},
 frequency_recall_v2:{easy:{answerMs:70000,roundAnswerMs:10500},expert:{answerMs:45000,roundAnswerMs:6000}},
 colour_recall_v2:{easy:{answerMs:60000,roundRevealMs:2200},expert:{answerMs:32000,roundRevealMs:800}},
 frequency_recall:{easy:{answerMs:18000},expert:{answerMs:9000}},
 colour_recall:{easy:{revealMs:3500,answerMs:22000},expert:{revealMs:1800,answerMs:12000}},
 time_recall:{easy:{answerMs:20000},expert:{answerMs:10000}},
 shape_recall:{easy:{revealMs:4000,answerMs:20000},expert:{revealMs:1800,answerMs:10000}},
 rhythm_recall:{easy:{answerMs:28000},expert:{answerMs:14000}},
 dot_estimate:{easy:{revealMs:3300,answerMs:10000},expert:{revealMs:1400,answerMs:5000}},
 number_order:{easy:{answerMs:12000},expert:{answerMs:6000}},
 odd_one_out:{easy:{answerMs:9000},expert:{answerMs:4000}},
 pattern_complete:{easy:{answerMs:28000},expert:{answerMs:14000}},
 typing_sprint:{easy:{wordLength:"short"},expert:{wordLength:"long"}},
 reaction_test:{easy:{answerMs:28000,tapWindowMs:1500},expert:{answerMs:25000,tapWindowMs:900}},
 target_tap:{easy:{answerMs:22000},expert:{answerMs:12000}},
 cryptic_duel:{easy:{answerMs:45000},expert:{answerMs:30000}}
};
export function practiceTiming(id:GameId,difficulty:PracticeDifficulty){
 const game=getGame(id);const o:Overrides=difficulty==="standard"?{}:tiers[id]?.[difficulty]??{};
 return {...o,revealMs:o.revealMs??game.revealDurationMs,answerMs:o.answerMs??game.answerDurationMs};
}
export function practiceChallenge(id:GameId,seed:string,difficulty:PracticeDifficulty):Challenge{
 const challenge=getGame(id).generate(seed),s=practiceTiming(id,difficulty);
 if(id==="memory_grid"||id==="memory_grid_v2")return {...challenge,flashMs:s.revealMs,revealMs:s.revealMs};
 if(s.roundAnswerMs)challenge.roundAnswerMs=s.roundAnswerMs;
 if(s.roundRevealMs)challenge.roundRevealMs=s.roundRevealMs;
 if(s.tapWindowMs)challenge.tapWindowMs=s.tapWindowMs;
 if(s.wordLength){
  const words=challenge.words as string[];
  const filtered=words.filter(w=>s.wordLength==="short"?w.length<=5:w.length>=6);
  if(filtered.length>1){const stream=Array.from({length:words.length},(_,i)=>filtered[i%filtered.length]);challenge.words=stream;challenge.text=stream.join(" ");}
 }
 return challenge;
}
export function practiceDifficultyDescription(id:GameId,difficulty:PracticeDifficulty){
 const s=practiceTiming(id,difficulty);
 if(s.wordLength)return `30s typing with ${s.wordLength==="short"?"shorter":"longer"} words`;
 if(id==="reaction_test")return `5 attempts, ${(s.tapWindowMs??1250)/1000}s to tap`;
 if(id==="frequency_recall_v2")return `5 tones, ${(s.roundAnswerMs??8200)/1000}s per answer`;
 if(id==="colour_recall_v2")return `${(s.roundRevealMs??1150)/1000}s colour reveal, ${s.answerMs/1000}s total`;
 return `${s.revealMs?`${s.revealMs/1000}s reveal, `:""}${s.answerMs/1000}s to answer`;
}
