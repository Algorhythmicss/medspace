// Pure-SVG sparkline, server-rendered — no client JS, no layout shift.
// Colour carries clinical direction, not decoration: worsening reads warm,
// improving reads green, flat stays neutral.
export default function Sparkline({
  points,
  higherIsWorse,
  minDelta,
  width = 72,
  height = 22,
  onDark = false,
}: {
  points: number[]; // chronological
  higherIsWorse: boolean;
  minDelta: number;
  width?: number;
  height?: number;
  onDark?: boolean;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 3;
  const xStep = (width - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const coords = points.map((v, i) => [pad + i * xStep, y(v)] as const);
  const line = coords
    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height} L${coords[0][0].toFixed(1)},${height} Z`;

  const delta = points[points.length - 1] - points[0];
  const flat = Math.abs(delta) < minDelta;
  const worsening = higherIsWorse ? delta > 0 : delta < 0;
  // brighter hues hold up against the night-blue hero
  const stroke = onDark
    ? flat
      ? "#9db2d4"
      : worsening
        ? "#ff8a75"
        : "#5fd6bd"
    : flat
      ? "#a29b91"
      : worsening
        ? "#e5533d"
        : "#17a087";
  const gradId = `sg-${stroke.slice(1)}-${points.length}-${Math.round(points[0] * 100)}`;

  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.2" fill={stroke} />
    </svg>
  );
}
