import {describe,it,expect} from "vitest";
import {dailyDate,dailyPublicChallenge,scoreDaily,dailyRequestSchema,dailyLeaderboard} from "./daily-duel";
import {getGame} from "./registry";
describe("daily challenge",()=>{
 it("changes dates at UTC midnight and does not disclose answers or seeds",()=>{
  expect(dailyDate(new Date("2026-11-27T23:59:59Z"))).toBe("2026-11-27");
  expect(dailyDate(new Date("2026-11-28T00:00:00Z"))).toBe("2026-11-28");
  const first=dailyPublicChallenge("secret-a");
  expect(first).toEqual(dailyPublicChallenge("secret-a"));
  expect(JSON.stringify(first)).not.toContain('"answer"');
  expect(JSON.stringify(first)).not.toContain("secret-a");
 });
 it("scores partial answers server-side and rejects supplied score, seed or invalid date",()=>{
  const puzzles=getGame("pattern_complete").generate("secret").puzzles as {options:string[];answer:string}[];
  const answers=puzzles.map(p=>p.options.indexOf(p.answer));expect(scoreDaily("secret",answers)).toBe(6);
  expect(scoreDaily("secret",[answers[0],null,null,null,null,null])).toBe(1);
  expect(dailyRequestSchema.safeParse({action:"submit",date:"2026-11-27",answers,score:6}).success).toBe(false);
  expect(dailyRequestSchema.safeParse({action:"start",seed:"x"}).success).toBe(false);
  expect(dailyRequestSchema.safeParse({action:"submit",date:"2026-02-30",answers}).success).toBe(false);
 });
 it("uses shared ranks for ties",()=>{expect(dailyLeaderboard([{name:"A",score:5},{name:"B",score:6},{name:"C",score:6}]).map(x=>x.rank)).toEqual([1,1,3]);});
});
