"use client";

interface BarChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function BarChart({
  data,
  width = 200,
  height = 50,
  color = "#10b981",
  className,
}: BarChartProps) {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data, 1);
  const barWidth = Math.max(2, (width - data.length * 2) / data.length);
  const gap = (width - barWidth * data.length) / (data.length + 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      {data.map((v, i) => {
        const barH = Math.max(1, (v / max) * (height - 2));
        const x = gap + i * (barWidth + gap);
        const y = height - barH;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barH}
            fill={color}
            rx={Math.min(1, barWidth / 4)}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}
