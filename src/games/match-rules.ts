import {z} from "zod";
import type {Challenge} from "./types";
import {createRandom,shuffle} from "./random";
import { RHYTHM_REVEAL_DURATION_MS } from "./rhythm-input";

// Secure recall keeps its fixed round count, reveal/listen gate and total budget. Reaction schedules remain fixed.
export const CUSTOM_TIMING_GAMES=["memory_grid","shape_recall","dot_estimate","number_order","odd_one_out","pattern_complete","typing_sprint","rhythm_recall","frequency_recall_v2","colour_recall_v2"] as const;
export const CUSTOM_REVEAL_GAMES=["memory_grid","shape_recall","dot_estimate"] as const;
export const supportsCustomTiming=(game:unknown)=>CUSTOM_TIMING_GAMES.some(id=>id===game);
export const supportsCustomReveal=(game:unknown)=>CUSTOM_REVEAL_GAMES.some(id=>id===game);
export const customRoundTiming=(game:unknown)=>game==="frequency_recall_v2"?{totalMs:60000,maxMs:6000}:game==="colour_recall_v2"?{totalMs:40000,maxMs:5200}:null;
export const workshopSchema=z.object({
 version:z.literal(1),
 answerMs:z.number().int().min(3000).max(60000),
 revealMs:z.number().int().min(0).max(RHYTHM_REVEAL_DURATION_MS),
 roundAnswerMs:z.number().int().min(3000).max(6000).optional(),
 dotDensity:z.enum(["sparse","standard","dense"]).optional(),
 shapeRange:z.enum(["gentle","standard","wide"]).optional(),
 memory:z.object({size:z.number().int().min(3).max(8),tiles:z.number().int().min(1).max(32),ordered:z.boolean()}).strict().optional()
}).strict().superRefine((value,ctx)=>{
 if(value.memory&&(value.memory.tiles>=value.memory.size**2||value.revealMs<500))ctx.addIssue({code:"custom",message:"Choose fewer tiles than cells and at least 0.5s to reveal."});
 if(value.memory?.ordered&&value.revealMs<value.memory.tiles*250)ctx.addIssue({code:"custom",message:"Ordered recall requires at least 0.25s per tile."});
});
export type WorkshopRules=z.infer<typeof workshopSchema>;
export const matchRulesSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("adaptive"),version:z.literal(1),tier:z.enum(["beginner","standard","advanced","elite"])}).strict(),
 z.object({kind:z.literal("workshop"),version:z.literal(1),rules:workshopSchema}).strict()
]);
export type MatchRules=z.infer<typeof matchRulesSchema>;
export function validWorkshop(game:unknown,rules:WorkshopRules){
 if((rules.dotDensity!==undefined&&game!=="dot_estimate")||(rules.shapeRange!==undefined&&game!=="shape_recall"))return false;
 const round=customRoundTiming(game);
 if(round)return rules.revealMs===0&&rules.answerMs===round.totalMs&&typeof rules.roundAnswerMs==="number"&&Number.isInteger(rules.roundAnswerMs)&&rules.roundAnswerMs>=3000&&rules.roundAnswerMs<=round.maxMs&&!rules.memory;
 return rules.roundAnswerMs===undefined&&supportsCustomTiming(game)&&(game==="rhythm_recall"?rules.revealMs===RHYTHM_REVEAL_DURATION_MS&&rules.answerMs>=10000:supportsCustomReveal(game)?rules.revealMs>=500&&rules.revealMs<=10000:rules.revealMs===0)&&((game==="memory_grid")===Boolean(rules.memory));
}
export function rankTier(rating:number,matches:number){
 if(matches<5)return "standard" as const;
 return rating<1000?"beginner":rating<1200?"standard":rating<1600?"advanced":"elite";
}
export function sharedRankTier(players:readonly {rating:number;matches:number}[]){
 return players.length!==2||players.some(p=>p.matches<5)?"standard":rankTier(Math.min(...players.map(p=>p.rating)),5);
}
export function recommendedPractice(rating:number,matches:number){
 const tier=rankTier(rating,matches);
 return tier==="beginner"?"easy":tier==="standard"?"standard":"expert";
}
export function customMemoryChallenge(seed:string,rules:WorkshopRules):Challenge{
 if(!rules.memory)throw new Error("Missing memory parameters");
 const {size,tiles,ordered}=rules.memory;
 return {size,targetCount:tiles,ordered,highlightedCells:shuffle(createRandom(seed),Array.from({length:size*size},(_,i)=>i)).slice(0,tiles),flashMs:rules.revealMs,revealMs:rules.revealMs};
}
export const memorySelectionSchema=z.object({selectedCells:z.array(z.number().int().min(0).max(63)).min(1).max(32)}).strict().refine(s=>new Set(s.selectedCells).size===s.selectedCells.length);
export function validMemorySelection(challenge:Challenge,submission:{selectedCells:number[]}){
 return submission.selectedCells.length<=Number(challenge.targetCount)&&submission.selectedCells.every(cell=>cell<Number(challenge.size)**2);
}
export function orderedMemoryScore(expected:number[],selected:number[]){
 const correct=selected.filter((cell,i)=>expected[i]===cell).length;
 const incorrect=selected.length-correct;
 const missed=expected.length-correct;
 return {correct,incorrect,missed,rankScore:correct-incorrect*.5,accuracy:correct/Math.max(1,expected.length+incorrect)};
}
export function rulesLabel(rules:unknown){
 const parsed=matchRulesSchema.safeParse(rules);if(!parsed.success)return null;
 if(parsed.data.kind==="adaptive")return `${parsed.data.tier[0].toUpperCase()+parsed.data.tier.slice(1)} timing`;
 const r=parsed.data.rules,m=r.memory;
 if(r.roundAnswerMs!==undefined)return `5 rounds · ${r.roundAnswerMs/1000}s answer per round`;
 const modifier=r.dotDensity?` · ${r.dotDensity} dots`:r.shapeRange?` · ${r.shapeRange} shape variation`:"";
 return m?`${m.size}×${m.size} · ${m.tiles} tiles · ${r.revealMs/1000}s reveal · ${r.answerMs/1000}s answer${m.ordered?" · Ordered recall":""}`:`${r.revealMs?r.revealMs/1000+"s reveal · ":""}${r.answerMs/1000}s answer${modifier}`;
}
