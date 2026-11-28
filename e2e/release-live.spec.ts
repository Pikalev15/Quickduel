import { expect, test } from "@playwright/test";

test("real browser sessions can match, create a Workshop and submit a daily attempt", async ({ browser }) => {
  test.skip(process.env.E2E_LIVE_SUPABASE !== "1", "Requires disposable local Supabase");
  test.setTimeout(120_000);
  const first=await browser.newContext(), second=await browser.newContext();
  try {
    const a=await first.newPage(), b=await second.newPage();
    const health=await a.request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).data).toMatchObject({migrationCompatible:true,releaseActivated:true});
    await Promise.all([a.goto("/play?playlist=quick&game=memory_grid"),b.goto("/play?playlist=quick&game=memory_grid")]);
    await Promise.all([a.waitForURL(/\/match\/[0-9a-f-]{36}/,{timeout:60000}),b.waitForURL(/\/match\/[0-9a-f-]{36}/,{timeout:60000})]);
    expect(new URL(a.url()).pathname).toBe(new URL(b.url()).pathname);
    const matchId=new URL(a.url()).pathname.split("/").pop();
    const [snapA,snapB]=await Promise.all([a.request.get("/api/matches/"+matchId),b.request.get("/api/matches/"+matchId)]);
    expect(snapA.ok()).toBeTruthy();expect(snapB.ok()).toBeTruthy();
    expect((await snapA.json()).data.current_user_id).not.toBe((await snapB.json()).data.current_user_id);
    await Promise.all([a.goto("/"),b.goto("/")]);
    const created=await a.request.post("/api/duels",{data:{selectionKind:"game",game:"memory_grid",playlist:"quick",bestOf:1,ranked:false,workshop:{version:1,revealMs:3000,answerMs:9000,memory:{size:5,tiles:7,ordered:false}}}});
    expect(created.ok(),await created.text()).toBeTruthy();
    const {code}=(await created.json()).data;
    const joined=await b.request.post("/api/duels/"+code,{data:{}});
    expect(joined.ok(),await joined.text()).toBeTruthy();
    const workshopId=(await joined.json()).data.match_id;
    const snap=await a.request.get("/api/matches/"+workshopId);
    expect(snap.ok(),await snap.text()).toBeTruthy();
    expect((await snap.json()).data).toMatchObject({ranked:false,reveal_duration_ms:3000,answer_duration_ms:9000,match_rules:{kind:"workshop"}});
    const daily=await a.request.post("/api/daily",{data:{action:"start"}});
    expect(daily.ok(),await daily.text()).toBeTruthy();
    const attempt=(await daily.json()).data;
    const submit=await a.request.post("/api/daily",{data:{action:"submit",date:attempt.date,answers:Array(6).fill(null)}});
    expect(submit.ok(),await submit.text()).toBeTruthy();
    expect((await submit.json()).data).toMatchObject({status:"complete",score:0});
  } finally {
    await Promise.all([first.close(),second.close()]);
  }
});
