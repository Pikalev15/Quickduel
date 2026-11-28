import {describe,it,expect} from "vitest";
import {workshopSchema,customMemoryChallenge,validMemorySelection,orderedMemoryScore,sharedRankTier,validWorkshop} from "./match-rules";
import {getGame,generateMatchChallenge} from "./registry";
describe("workshop and rank timing",()=>{
 const config={version:1 as const,revealMs:4000,answerMs:10000,memory:{size:6,tiles:8,ordered:true}};
 it("keeps placements standard and uses the same lower bracket for both placed players",()=>{
  expect(sharedRankTier([{rating:1800,matches:4},{rating:1800,matches:10}])).toBe("standard");
  expect(sharedRankTier([{rating:1800,matches:8},{rating:1250,matches:8}])).toBe("advanced");
 });
 it("rejects invalid geometry and insufficient ordered exposure",()=>{
  expect(workshopSchema.safeParse({...config,memory:{size:3,tiles:9,ordered:false}}).success).toBe(false);
  expect(workshopSchema.safeParse({...config,revealMs:500}).success).toBe(false);
  expect(validWorkshop("frequency_recall_v2",config)).toBe(false);
 });
 it("allows only a complete fixed rhythm reveal and at least ten seconds to answer",()=>{
  const rhythm={version:1 as const,revealMs:13000,answerMs:20000};
  expect(workshopSchema.safeParse(rhythm).success).toBe(true);
  expect(validWorkshop("rhythm_recall",rhythm)).toBe(true);
  expect(validWorkshop("rhythm_recall",{...rhythm,revealMs:10000})).toBe(false);
  expect(validWorkshop("rhythm_recall",{...rhythm,answerMs:9000})).toBe(false);
  expect(validWorkshop("shape_recall",rhythm)).toBe(false);
  expect(validWorkshop("rhythm_recall",{...rhythm,memory:config.memory})).toBe(false);
 });
 it("restricts secure recall custom rules to safe per-round answer windows",()=>{
  const frequency={version:1 as const,revealMs:0,answerMs:60000,roundAnswerMs:6000};
  const colour={version:1 as const,revealMs:0,answerMs:40000,roundAnswerMs:5200};
  expect(workshopSchema.safeParse(frequency).success).toBe(true);
  expect(validWorkshop("frequency_recall_v2",frequency)).toBe(true);
  expect(validWorkshop("colour_recall_v2",colour)).toBe(true);
  expect(validWorkshop("frequency_recall_v2",{...frequency,roundAnswerMs:6001})).toBe(false);
  expect(validWorkshop("colour_recall_v2",{...colour,roundAnswerMs:5400})).toBe(false);
  expect(validWorkshop("frequency_recall_v2",{...frequency,answerMs:40000})).toBe(false);
  expect(validWorkshop("frequency_recall_v2",{...frequency,revealMs:500})).toBe(false);
  expect(validWorkshop("colour_recall_v2",{...colour,roundAnswerMs:undefined})).toBe(false);
  expect(validWorkshop("typing_sprint",frequency)).toBe(false);
 });
 it("applies deterministic game-specific variations without changing standard challenges",()=>{
  const base={version:1 as const,revealMs:2000,answerMs:10000};
  for(const dotDensity of ["sparse","standard","dense"] as const){
   const rules={...base,dotDensity};
   const game=getGame("dot_estimate");
   const challenge=generateMatchChallenge(game,"dots",2000,10000,{kind:"workshop",version:1,rules});
   expect(validWorkshop("dot_estimate",rules)).toBe(true);
   expect(validWorkshop("shape_recall",rules)).toBe(false);
   expect(challenge).toEqual(generateMatchChallenge(game,"dots",2000,10000,{kind:"workshop",version:1,rules}));
   const [min,max]=dotDensity==="sparse"?[20,55]:dotDensity==="dense"?[90,150]:[35,120];
   expect(Number(challenge.count)).toBeGreaterThanOrEqual(min);
   expect(Number(challenge.count)).toBeLessThanOrEqual(max);
   expect((challenge.dots as unknown[]).length).toBe(challenge.count);
   if(dotDensity==="standard")expect(challenge).toEqual(game.generate("dots"));
  }
  for(const shapeRange of ["gentle","standard","wide"] as const){
   const rules={...base,shapeRange};
   const game=getGame("shape_recall");
   const challenge=generateMatchChallenge(game,"shape",2000,10000,{kind:"workshop",version:1,rules});
   const [min,max]=shapeRange==="gentle"?[35,70]:shapeRange==="wide"?[10,90]:[18,88];
   expect(validWorkshop("shape_recall",rules)).toBe(true);
   expect(validWorkshop("dot_estimate",rules)).toBe(false);
   expect((challenge.radii as number[]).every(n=>n>=min&&n<=max)).toBe(true);
   if(shapeRange==="standard")expect(challenge).toEqual(game.generate("shape"));
  }
 });
 it("generates deterministic secret positions and validates submissions",()=>{
  const c=customMemoryChallenge("seed",config),game=getGame("memory_grid");
  expect(c).toEqual(generateMatchChallenge(game,"seed",4000,10000,{kind:"workshop",version:1,rules:config}));
  expect((c.highlightedCells as number[]).length).toBe(8);
  expect(game.publicChallenge(c,"answer").highlightedCells).toBeUndefined();
  expect(validMemorySelection(c,{selectedCells:[36]})).toBe(false);
  expect(orderedMemoryScore([1,2,3],[1,3,2]).correct).toBe(1);
  expect(game.calculate(c,{selectedCells:c.highlightedCells},1000).rankScore).toBe(8);
 });
});
