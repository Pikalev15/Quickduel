import { ImageResponse } from "next/og";

export const alt = "QuickDuel - fast multiplayer perception games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f3f5f8", color: "#101318", padding: 64 }}>
      <div style={{ width: "58%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 800 }}>
          <div style={{ width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "#3157d5", color: "white" }}>QD</div>
          QUICKDUEL
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#3157d5", fontSize: 22, fontWeight: 700, textTransform: "uppercase" }}>Fast multiplayer perception games</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 18, fontSize: 92, fontWeight: 900, lineHeight: 0.9, textTransform: "uppercase" }}><span>Notice it.</span><span>Win it.</span></div>
        </div>
        <div style={{ color: "#626a76", fontSize: 24 }}>Accuracy wins. Trusted timing settles the closest calls.</div>
      </div>
      <div style={{ width: "42%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "#3157d5", padding: 58 }}>
        <div style={{ width: 340, height: 340, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Array.from({ length: 16 }, (_, index) => <div key={index} style={{ width: 77, height: 77, borderRadius: 6, border: "1px solid rgba(255,255,255,.35)", background: [1, 4, 6, 10, 13, 15].includes(index) ? "white" : "rgba(12,31,96,.2)" }} />)}
        </div>
      </div>
    </div>,
    size,
  );
}
