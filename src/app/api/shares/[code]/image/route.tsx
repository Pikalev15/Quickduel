import { getGame } from "@/games/registry";
import { roundScores } from "@/games/feedback-visual";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

type SharedPlayer = {
  display_name: string;
  summary: string;
  details: Record<string, number | string | boolean> | null;
  rating_delta: number | null;
  winner: boolean;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  if (!/^[A-F0-9]{12}$/i.test(code)) {
    return new Response("Not found", { status: 404 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_match_share", {
    requested_code: code.toUpperCase(),
  });
  if (error || !data) return new Response("Not found", { status: 404 });
  const players = data.players as SharedPlayer[];
  const game = getGame(data.game_type);
  const typingSprint = data.game_type === "typing_sprint";
  const frequencyRecall = data.game_type === "frequency_recall_v2";
  const colourRecall = data.game_type === "colour_recall_v2";
  const winner = players.find((player) => player.winner);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 64px",
          background: "#f7f6f2",
          color: "#171717",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 800 }}>QuickDuel</div>
          <div style={{ display: "flex", fontSize: 24, color: "#3157d5", textTransform: "uppercase", letterSpacing: 3 }}>
            {data.ranked ? "Ranked duel" : "Unranked duel"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 28, color: "#3157d5", textTransform: "uppercase", letterSpacing: 4 }}>
            {typingSprint ? "QUICKDUEL TYPING SPRINT" : game.name}
          </div>
          <div style={{ display: "flex", fontSize: 72, lineHeight: 1, fontWeight: 800, marginTop: 18 }}>
            {winner ? "Victory" : "Draw"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 28 }}>
          {players.map((player) => (
            <div
              key={player.display_name}
              style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                padding: "24px",
                border: `2px solid ${player.winner ? "#3157d5" : "#deddd8"}`,
                background: "#ffffff",
                borderRadius: 18,
              }}
            >
              <div style={{ display: "flex", fontSize: 28, fontWeight: 750 }}>{player.display_name}</div>
              <div style={{ display: "flex", fontSize: 38, fontWeight: 700, marginTop: 14 }}>{player.summary}</div>
              {frequencyRecall && player.details && (
                <div style={{ display: "flex", marginTop: 12, fontSize: 20, color: "#6d6c67" }}>
                  Closest round {Number(player.details.closestRound)} · Average error {Number(player.details.averageError).toFixed(1)} cents
                </div>
              )}
              {colourRecall && player.details && (
                <div style={{ display: "flex", marginTop: 12, fontSize: 20, color: "#6d6c67" }}>
                  Best round {Number(player.details.bestRound)} · Average distance {Number(player.details.averageDistance).toFixed(4)}
                </div>
              )}
              {(frequencyRecall || colourRecall) && player.details && roundScores(player.details).some(r=>r.score!==null) && <div style={{display:"flex",gap:8,marginTop:10,alignItems:"flex-end"}}>{roundScores(player.details).map((r,index)=><div key={index} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flex:1}}><div style={{display:"flex",height:38,width:"100%",alignItems:"flex-end",background:"#eceef7"}}><div style={{height:Math.max(2,(r.score??0)*3.8),width:"100%",background:player.winner?"#3157d5":"#8994af"}}/></div><span style={{fontSize:14,color:"#555"}}>{r.answered?r.score?.toFixed(1)??"–":"–"}</span></div>)}</div>}
              {data.ranked && player.rating_delta !== null && (
                <div style={{ display: "flex", marginTop: 16, fontSize: 26, color: player.rating_delta >= 0 ? "#3157d5" : "#6d6c67" }}>
                  {player.rating_delta >= 0 ? "+" : ""}{player.rating_delta} Elo
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#6d6c67" }}>
          {typingSprint
            ? "Typing Sprint ranks net WPM. Errors reduce your score."
            : frequencyRecall || colourRecall
              ? "Five rounds. Each reconstruction scores up to 10."
            : "Accuracy first. Speed breaks ties."}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
