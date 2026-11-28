export function CorrectShapeAnswer({ radii }: { radii: number[] }) {
  const points = radii.map((radius, index) => {
    const angle = (Math.PI * 2 * index) / radii.length - Math.PI / 2;
    const scaled = 30 + radius * 0.65;
    return { x: 100 + Math.cos(angle) * scaled, y: 100 + Math.sin(angle) * scaled };
  });
  return (
    <svg className="shape-canvas" viewBox="0 0 200 200" role="img" aria-label="Correct six-point shape">
      <polygon points={points.map(({ x, y }) => `${x},${y}`).join(" ")} />
      {points.map(({ x, y }, index) => (
        <g className="shape-point-label" key={index} aria-hidden="true">
          <circle cx={x} cy={y} r="8" />
          <text x={x} y={y}>{index + 1}</text>
        </g>
      ))}
    </svg>
  );
}

export function CorrectAnswer({ gameId, challenge }: { gameId: string; challenge: Record<string, unknown> }) {
  if (gameId === "shape_recall" && Array.isArray(challenge.radii)) return <CorrectShapeAnswer radii={challenge.radii as number[]} />;
  let answer: string | undefined;
  if ((gameId === "memory_grid" || gameId === "memory_grid_v2") && Array.isArray(challenge.highlightedCells)) {
    const size = Number(challenge.size);
    answer = (challenge.highlightedCells as number[]).map(cell => `row ${Math.floor(cell / size) + 1}, column ${cell % size + 1}`).join("; ");
  } else if (gameId === "time_recall" && Array.isArray(challenge.durations)) {
    answer = (challenge.durations as number[]).map((ms, i) => `Pulse ${i + 1}: ${(ms / 1000).toFixed(3)}s`).join(" · ");
  } else if ((gameId === "frequency_recall" || gameId === "frequency_recall_v2") && Array.isArray(challenge.frequencies)) {
    answer = (challenge.frequencies as number[]).map((hz, i) => `Tone ${i + 1}: ${hz} Hz`).join(" · ");
  } else if ((gameId === "colour_recall" || gameId === "colour_recall_v2") && Array.isArray(challenge.colors)) {
    return <div className="flex flex-wrap gap-3">{(challenge.colors as {l:number;c:number;h:number}[]).map((color,i)=>
      <div key={i} className="text-center"><div className="h-16 w-16 rounded-md border" style={{background:`oklch(${color.l}% ${color.c / 100} ${color.h})`}} role="img" aria-label={`Colour ${i+1}: lightness ${color.l}, chroma ${color.c}, hue ${color.h}`}/><p>Colour {i+1}</p></div>
    )}</div>;
  } else if (gameId === "rhythm_recall" && Array.isArray(challenge.rhythms)) {
    answer = (challenge.rhythms as number[][]).map((taps,i)=>`Rhythm ${i+1}: ${taps.slice(1).map((tap,j)=>tap-taps[j]).join(" / ")} ms`).join(" · ");
  } else if (gameId === "typing_sprint" && typeof challenge.text === "string") answer = challenge.text;
  else if (gameId === "dot_estimate" && typeof challenge.count === "number") answer = `${challenge.count} dots`;
  else if (gameId === "number_order" && Array.isArray(challenge.numbers)) answer = (challenge.numbers as {value: number}[]).map(n => n.value).sort((a,b) => a-b).join(" → ");
  else if (gameId === "odd_one_out" && typeof challenge.oddIndex === "number") answer = `Tile ${challenge.oddIndex + 1}`;
  else if (gameId === "pattern_complete" && Array.isArray(challenge.puzzles)) answer = (challenge.puzzles as {answer?: string}[]).map((p, i) => `${i + 1}: ${p.answer}`).join(" · ");
  else if (gameId === "cryptic_duel" && typeof challenge.answer === "string") answer = `${challenge.answer}. ${String(challenge.explanation ?? "")}`;
  return answer ? <p>{answer}</p> : null;
}
