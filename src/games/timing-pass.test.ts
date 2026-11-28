import {describe,expect,it} from "vitest";
import {getGame,generateMatchChallenge} from "./registry";
import {median,REACTION_TAP_MS} from "./timing-pass";
describe("initial playtest timing",()=>{
 it("uses requested game limits and preserves old ranked timing",()=>{
  expect(getGame("odd_one_out").answerDurationMs).toBe(6000);
  expect(getGame("memory_grid").answerDurationMs).toBe(7000);
  expect(getGame("memory_grid").revealDurationMs).toBe(2500);
  expect(getGame("memory_grid_v2").revealDurationMs).toBe(4000);
  expect(getGame("frequency_recall_v2").answerDurationMs).toBe(71000);
  expect(getGame("typing_sprint").answerDurationMs).toBe(30000);
  expect(getGame("cryptic_duel").answerDurationMs).toBe(40000);
  const typing=getGame("typing_sprint");
  const old=generateMatchChallenge(typing,"legacy",0,15000);
  const newer=generateMatchChallenge(typing,"legacy",0,30000);
  expect(old.text).toBe(newer.text);
  const typed=String(old.text).slice(0,30);
  expect(typing.calculate(old,{typed},15000).rankScore).toBe(2*typing.calculate(newer,{typed},30000).rankScore);
  expect(generateMatchChallenge(getGame("memory_grid"),"legacy",2950,8000)).toMatchObject({flashMs:1200,revealMs:2950});
 });
 it("scores the median with capped misses, not the fastest response",()=>{
  const game=getGame("reaction_test"),challenge=game.generate("test");
  const waits=challenge.waits as number[];
  expect(waits).toHaveLength(5);
  expect(waits.every(ms=>ms>=1500&&ms<=3500)).toBe(true);
  expect(challenge.tapWindowMs).toBe(REACTION_TAP_MS);
  expect(median([100,250,350,1000,1250])).toBe(350);
  expect(game.calculate(challenge,{reactionTimesMs:[100,250,350,1000,1250],falseStarts:0},10000).rankScore).toBe(-350);
 });
 it("retains answered frequency rounds when another round times out",()=>{
  const game=getGame("frequency_recall_v2"),challenge=game.generate("test");
  const target=(challenge.frequencies as number[])[0];
  const submission={guessesHz:[target,null,null,null,null]};
  expect(game.submissionSchema.safeParse(submission).success).toBe(true);
  expect(game.calculate(challenge,submission,60000).details).toMatchObject({round1Answered:true,round2Answered:false,totalScore:10});
 });
});
