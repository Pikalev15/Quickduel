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
 it("adds two sensory formats in v3 without changing v1 or v2 rotation",()=>{
  const dates=Array.from({length:5},(_,i)=>`2026-11-${20+i}`);
  expect(new Set(dates.map(date=>dailyKind(date,3))).size).toBe(5);
  for(const date of dates){
   const kind=dailyKind(date,3),puzzles=dailyPuzzles("seed",date,3);
   expect(puzzles).toEqual(dailyPuzzles("seed",date,3));
   expect(puzzles).toHaveLength(6);
   expect(JSON.stringify(dailyPublicChallenge("seed",date,3))).not.toContain('"answer"');
   expect(scoreDaily("seed",puzzles.map(p=>p.options.indexOf(p.answer)),date,3)).toBe(6);
   for(const puzzle of puzzles){
    expect(new Set(puzzle.options).size).toBe(4);
    if(kind==="colour_match")expect(puzzle.options).not.toContain(puzzle.sequence[0]);
    if(kind==="dot_estimate")expect(puzzle.dots?.length).toBe(Number(puzzle.answer));
   }
   expect(["pattern_complete","number_sequence","odd_one_out"]).toContain(dailyKind(date,2));
  }
 });
 it("keeps practice records on score, not wins or sheer attempt count",()=>{
 const first=updatePracticeRecord(null,{score:8,accuracy:.8,timeMs:4000,summary:"8"});
 const second=updatePracticeRecord(first.record,{score:7,accuracy:1,timeMs:2000,summary:"7"});
 expect(second.improved).toBe(false);expect(second.record.score).toBe(8);
 expect(masteryLevel(1,4)).toBe("Learning");expect(masteryLevel(.95,5)).toBe("Expert");
 });
});
