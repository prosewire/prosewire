export function Sparkline({ values }: { values: number[] }) {
  const safe = values.length > 1 ? values : [1, 1];
  const max = Math.max(...safe, 1);
  const points = safe
    .map(
      (value, index) =>
        `${(index / (safe.length - 1)) * 100},${38 - (value / max) * 32}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 42"
      preserveAspectRatio="none"
      className="h-12 w-full"
      aria-label="Views trend"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef6848" stopOpacity=".24" />
          <stop offset="100%" stopColor="#ef6848" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,42 ${points} 100,42`} fill="url(#spark-fill)" />
      <polyline
        points={points}
        fill="none"
        stroke="#ef6848"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
