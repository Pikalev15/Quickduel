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
  if ((gameId === "memory_grid" || gameId === "memory_grid_xl") && Array.isArray(challenge.highlightedCells)) {
    const size = Number(challenge.size);
    answer = (challenge.highlightedCells as number[]).map(cell => `row ${Math.floor(cell / size) + 1}, column ${cell % size + 1}`).join("; ");
  } else if (gameId === "dot_estimate" && typeof challenge.count === "number") answer = `${challenge.count} dots`;
  else if (gameId === "number_order" && Array.isArray(challenge.numbers)) answer = (challenge.numbers as {value: number}[]).map(n => n.value).sort((a,b) => a-b).join(" → ");
  else if (gameId === "odd_one_out" && typeof challenge.oddIndex === "number") answer = `Tile ${challenge.oddIndex + 1}`;
  else if (gameId === "pattern_complete" && Array.isArray(challenge.puzzles)) answer = (challenge.puzzles as {answer?: string}[]).map((p, i) => `${i + 1}: ${p.answer}`).join(" · ");
  else if (gameId === "cryptic_duel" && typeof challenge.answer === "string") answer = `${challenge.answer}. ${String(challenge.explanation ?? "")}`;
  return answer ? <p>{answer}</p> : null;
}
