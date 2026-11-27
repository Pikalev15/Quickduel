import {test,expect} from "@playwright/test";
test("daily viewport plays one attempt, submits partial answers and displays shared leaderboard",async({page})=>{
 let complete=false;let received:unknown=null;
 await page.route("**/api/daily",async route=>{
  if(route.request().method()==="GET")return route.fulfill({json:{ok:true,data:{date:"2026-11-27",durationMs:45000,leaderboard:complete?[{name:"Player",score:1,rank:1}]:[],attempt:complete?{status:"complete",score:1}:null}}});
  const body=route.request().postDataJSON();
  if(body.action==="start")return route.fulfill({json:{ok:true,data:{date:"2026-11-27",status:"active",deadline:new Date(Date.now()+45000).toISOString(),challenge:{puzzles:Array.from({length:6},()=>({sequence:["●","■","●","■","?"],options:["●","■","▲","◆"]}))}}}});
  received=body.answers;complete=true;return route.fulfill({json:{ok:true,data:{date:"2026-11-27",status:"complete",score:1}}});
 });
 await page.goto("/daily");
 await page.getByRole("button",{name:"Start daily challenge"}).click();
 await expect(page.getByRole("region",{name:"Daily patterns"})).toBeVisible();
 await page.getByRole("button",{name:"Pattern 1: ●",exact:true}).click();
 await expect(page.getByText("1/6 answered")).toBeVisible();
 await page.getByRole("button",{name:"Submit daily result",exact:true}).click();
 await expect(page.getByRole("region",{name:"Daily result"})).toBeVisible();
 expect(received).toEqual([0,null,null,null,null,null]);
 await expect(page.getByRole("region",{name:"Daily leaderboard"}).getByRole("cell",{name:"Player",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Start daily challenge"})).toHaveCount(0);
});
