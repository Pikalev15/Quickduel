import {describe,it,expect} from "vitest";
import {dailyKind,dailyPuzzles,dailyPublicChallenge,scoreDaily,weekStart} from "./daily-duel";
import {updatePracticeRecord,masteryLevel} from "./personal-records";
describe("versioned daily rotation",()=>{
 it("rotates three games while preserving original v1 puzzles",()=>{
 const dates=["2026-11-27","2026-11-28","2026-11-29"];
 expect(new Set(dates.map(date=>dailyKind(date,2))).size).toBe(3);
 for(const date of dates){
 const puzzles=dailyPuzzles("seed",date,2);
 expect(puzzles).toHaveLength(6);
 expect(JSON.stringify(dailyPublicChallenge("seed",date,2))).not.toContain('"answer"');
 const answers=puzzles.map(p=>p.options.indexOf(p.answer));expect(scoreDaily("seed",answers,date,2)).toBe(6);
 expect(dailyPuzzles("seed",date,1)).toEqual(dailyPuzzles("seed"));
 }
 expect(weekStart("2026-11-29")).toBe("2026-11-23");
 });
 it("keeps practice records on score, not wins or sheer attempt count",()=>{
 const first=updatePracticeRecord(null,{score:8,accuracy:.8,timeMs:4000,summary:"8"});
 const second=updatePracticeRecord(first.record,{score:7,accuracy:1,timeMs:2000,summary:"7"});
 expect(second.improved).toBe(false);expect(second.record.score).toBe(8);
 expect(masteryLevel(1,4)).toBe("Learning");expect(masteryLevel(.95,5)).toBe("Expert");
 });
});
