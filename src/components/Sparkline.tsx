// Pure-SVG sparkline, server-rendered — no client JS. Color reflects clinical
// direction: red worsening, green improving, gray flat.
export default function Sparkline({
  points,
  higherIsWorse,
  minDelta,
  width = 96,
  height = 26,
}: {
  points: number[]; // chronological
  higherIsWorse: boolean;
  minDelta: number;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 3;
  const xStep = (width - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const coords = points.map((v, i) => [pad + i * xStep, y(v)] as const);
  const path = coords.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");

  const delta = points[points.length - 1] - points[0];
  const flat = Math.abs(delta) < minDelta;
  const worsening = higherIsWorse ? delta > 0 : delta < 0;
  const color = flat ? "#8e8e93" : worsening ? "#ff3b30" : "#34c759";

  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
    </svg>
  );
}
