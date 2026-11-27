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
