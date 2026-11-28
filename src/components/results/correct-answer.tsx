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
