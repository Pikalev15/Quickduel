import {describe,expect,it} from "vitest";
import {buildProductMetrics,type ProductEvent} from "./product-metrics";
const now=Date.parse("2026-11-27T12:00:00Z");
const event=(user:string,date:string,kind="match_started",duration:number|null=null):ProductEvent=>({event_type:kind,user_id:user,session_id:user,game_type:"memory_grid",match_id:null,device_class:"mobile",duration_ms:duration,occurred_at:date+"T12:00:00Z"});
describe("product metrics",()=>{
 it("deduplicates players and counts mature retention cohorts",()=>{
   const data=buildProductMetrics([event("a","2026-11-21"),event("a","2026-11-21"),event("a","2026-11-22"),event("b","2026-11-26"),event("a","2026-11-22","human_match_found",1000),event("a","2026-11-23","human_match_found",3000)],[
      {game_type:"memory_grid",status:"completed",starts_at:"2026-11-21T12:00:00Z",completion_reason:"normal"},
      {game_type:"memory_grid",status:"abandoned",starts_at:"2026-11-22T12:00:00Z",completion_reason:null},
      {game_type:"memory_grid",status:"active",starts_at:"2026-11-27T12:00:00Z",completion_reason:null}
    ],now,7,{eligible:20,started:10,placed:5});
    expect(data.players).toBe(2);expect(data.daily[0].players).toBe(1);expect(data.retention.day1).toEqual({cohort:1,returned:1,rate:1});
    expect(data.retention.day7.rate).toBeNull();expect(data.matches.completionRate).toBe(.5);expect(data.games[0].abandonmentRate).toBe(.5);expect(data.queue.medianMs).toBe(1000);expect(data.queue.p95Ms).toBe(3000);expect(data.placements.completionRate).toBe(.5);
 });
 it("reports unknown ratios instead of zero for empty denominators",()=>{const data=buildProductMetrics([],[],now,7,{eligible:0,started:0,placed:0});expect(data.matches.completionRate).toBeNull();expect(data.returning.rate).toBeNull();});
});
