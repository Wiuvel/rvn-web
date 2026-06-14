'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/index';

export interface AreaSeries {
  /** Key into each data row. */
  key: string;
  /** Legend / tooltip label. */
  label: string;
  /** Stroke + gradient base colour (hex). */
  color: string;
}

interface AreaChartProps {
  data: Array<Record<string, string | number>>;
  /** Key holding the category label (e.g. 'date' or 'hour'). */
  xKey: string;
  series: AreaSeries[];
  height?: number;
  className?: string;
}

const PAD = { top: 8, right: 8, bottom: 22, left: 32 };

/** Build a smooth-ish polyline path through the points. */
function linePath(points: Array<[number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
}

/**
 * Lightweight categorical area chart rendered as plain SVG — no charting
 * dependency. Covers the handful of single/dual-series area graphs the support
 * analytics dashboard needs, with a gradient fill, Y gridlines and a hover
 * tooltip. Replaces recharts (which pulled ~8 MB / a 99 KB gzip admin chunk).
 */
export function AreaChart({ data, xKey, series, height = 200, className }: AreaChartProps) {
  const gradId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = Math.max(0, height - PAD.top - PAD.bottom);

  const maxValue =
    Math.max(1, ...data.flatMap((row) => series.map((s) => Number(row[s.key]) || 0))) || 1;
  // Round the axis max up to a "nice" value for readable gridlines.
  const niceMax = niceCeil(maxValue);

  const xAt = (i: number) =>
    PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const yAt = (v: number) => PAD.top + innerH - (v / niceMax) * innerH;

  // Show at most ~7 X labels so the axis doesn't crowd (e.g. 24 hourly points).
  const xStep = Math.max(1, Math.ceil(data.length / 7));
  const yTicks = [0, niceMax / 2, niceMax];

  return (
    <div ref={ref} className={cn('relative', className)} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* Y gridlines + labels */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                y1={yAt(t)}
                x2={width - PAD.right}
                y2={yAt(t)}
                className="stroke-neutral-800"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={yAt(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-neutral-500 text-[10px]"
              >
                {Math.round(t)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {data.map((row, i) =>
            i % xStep === 0 ? (
              <text
                key={i}
                x={xAt(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-neutral-500 text-[10px]"
              >
                {row[xKey]}
              </text>
            ) : null,
          )}

          {/* Series areas + lines */}
          {series.map((s) => {
            const pts = data.map(
              (row, i) => [xAt(i), yAt(Number(row[s.key]) || 0)] as [number, number],
            );
            const area = `${linePath(pts)} L${xAt(data.length - 1)},${PAD.top + innerH} L${xAt(0)},${PAD.top + innerH} Z`;
            return (
              <g key={s.key}>
                <path d={area} fill={`url(#${gradId}-${s.key})`} />
                <path d={linePath(pts)} fill="none" stroke={s.color} strokeWidth={2} />
              </g>
            );
          })}

          {/* Hover guide + dots */}
          {hover !== null && (
            <g>
              <line
                x1={xAt(hover)}
                y1={PAD.top}
                x2={xAt(hover)}
                y2={PAD.top + innerH}
                className="stroke-neutral-600"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {series.map((s) => (
                <circle
                  key={s.key}
                  cx={xAt(hover)}
                  cy={yAt(Number(data[hover][s.key]) || 0)}
                  r={3.5}
                  fill={s.color}
                  className="stroke-neutral-900"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}

          {/* Transparent hit area for hover tracking */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={(e) => {
              const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
              const rel = e.clientX - rect.left;
              const idx = data.length <= 1 ? 0 : Math.round((rel / innerW) * (data.length - 1));
              setHover(Math.min(data.length - 1, Math.max(0, idx)));
            }}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}

      {/* Tooltip */}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: Math.min(width - 60, Math.max(60, xAt(hover))),
            top: PAD.top,
          }}
        >
          <div className="mb-1 font-medium text-neutral-300">{data[hover][xKey]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-neutral-400">{s.label}:</span>
              <span className="font-semibold text-white">{data[hover][s.key]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Round up to a readable axis maximum (1-2-5 × 10ⁿ). */
function niceCeil(value: number): number {
  if (value <= 5) return Math.ceil(value);
  const mag = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}
