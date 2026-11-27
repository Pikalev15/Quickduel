import {describe,it,expect} from "vitest";
import {GAME_IDS} from "./types";
import {getGame} from "./registry";
import {practiceChallenge,practiceTiming,parseDifficulty} from "./practice-difficulty";
describe("practice difficulty",()=>{
 it("leaves standard timing and ranked definitions unchanged",()=>{
  for(const id of GAME_IDS){const game=getGame(id);expect(practiceTiming(id,"standard")).toMatchObject({answerMs:game.answerDurationMs,revealMs:game.revealDurationMs});const before=game.generate("seed");practiceChallenge(id,"seed","expert");expect(game.generate("seed")).toEqual(before);}
  expect(parseDifficulty("bogus")).toBe("standard");
 });
 it("changes game-specific limits",()=>{
  expect(practiceTiming("memory_grid","easy")).toMatchObject({revealMs:3500,answerMs:10000});
  expect(practiceChallenge("memory_grid","seed","expert")).toMatchObject({flashMs:1800,revealMs:1800});
  expect(practiceTiming("frequency_recall_v2","expert").roundAnswerMs).toBe(6000);
  expect(practiceTiming("typing_sprint","easy").answerMs).toBe(30000);
  expect(practiceTiming("cryptic_duel","expert").answerMs).toBe(30000);
 });
});
