import {describe,it,expect} from "vitest";
import {frequencyRoundFeedback,colourRoundFeedback} from "./recall-rounds";
import {recallInsight,pitchPosition,roundScores} from "./feedback-visual";
describe("feedback visual",()=>{
 it("uses accurate direction and missing-answer labels",()=>{
  expect(recallInsight(frequencyRoundFeedback(440,450))).toContain("high");
  expect(recallInsight(frequencyRoundFeedback(440,null))).toBe("No answer was locked.");
  expect(recallInsight(colourRoundFeedback({l:60,c:20,h:180},{l:70,c:20,h:180}))).toContain("lighter");
  expect(pitchPosition(120)).toBe(0);expect(pitchPosition(2000)).toBeCloseTo(100);
  expect(roundScores({round1Score:8,round2Score:0,round2Answered:false}).slice(0,3)).toEqual([{score:8,answered:true},{score:0,answered:false},{score:null,answered:true}]);
 });
});
