import { getGame } from "@/games/registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

type SharedPlayer = {
  display_name: string;
  summary: string;
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
          padding: "72px",
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
          <div style={{ display: "flex", fontSize: 92, lineHeight: 1, fontWeight: 800, marginTop: 18 }}>
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
                padding: "32px",
                border: `2px solid ${player.winner ? "#3157d5" : "#deddd8"}`,
                background: "#ffffff",
                borderRadius: 18,
              }}
            >
              <div style={{ display: "flex", fontSize: 28, fontWeight: 750 }}>{player.display_name}</div>
              <div style={{ display: "flex", fontSize: 38, fontWeight: 700, marginTop: 14 }}>{player.summary}</div>
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
            : "Accuracy first. Speed breaks ties."}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
      },
    },
  );
}
