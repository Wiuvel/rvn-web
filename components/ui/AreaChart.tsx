'use client';

import { useMemo } from 'react';

interface DataPoint {
  value: number;
  label?: string;
}

interface AreaChartProps {
  data: DataPoint[];
  data2?: DataPoint[]; // Второй слой для stacked area chart
  height?: number;
  color?: string;
  color2?: string;
  className?: string;
  showGrid?: boolean;
  showLabels?: boolean;
}

/**
 * Компонент для отображения плавного area chart
 * Создает SVG path с плавными кривыми (smooth curves)
 */
export default function AreaChart({
  data,
  data2,
  height = 120,
  color = '#3b82f6',
  color2 = '#10b981',
  className = '',
  showGrid = true,
  showLabels = false,
}: AreaChartProps) {
  const { path, path2, maxValue, minValue, points, points2 } = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        path: '',
        path2: '',
        maxValue: 0,
        minValue: 0,
        points: [],
        points2: [],
      };
    }

    const width = 100; // Используем процентную ширину
    const padding = { top: 8, right: 4, bottom: showLabels ? 20 : 8, left: 4 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Находим максимальное значение для масштабирования
    const allValues = [
      ...data.map(d => d.value),
      ...(data2 || []).map(d => d.value),
    ];
    const max = Math.max(...allValues, 1);
    const min = Math.min(...allValues, 0);

    // Создаем точки для первого графика
    const step = chartWidth / (data.length - 1 || 1);
    const points = data.map((d, i) => ({
      x: padding.left + i * step,
      y: padding.top + chartHeight - (d.value / max) * chartHeight,
      value: d.value,
      label: d.label,
    }));

    // Создаем точки для второго графика (если есть)
    const points2 = data2
      ? data2.map((d, i) => ({
          x: padding.left + i * step,
          y: padding.top + chartHeight - (d.value / max) * chartHeight,
          value: d.value,
          label: d.label,
        }))
      : [];

    // Функция для создания плавного SVG path с использованием улучшенных кривых Безье
    const createSmoothPath = (pts: typeof points) => {
      if (pts.length === 0) return '';

      // Начинаем с нижней левой точки
      let path = `M ${padding.left} ${height - padding.bottom}`;
      path += ` L ${pts[0].x} ${height - padding.bottom}`;
      path += ` L ${pts[0].x} ${pts[0].y}`;

      if (pts.length === 1) {
        // Если только одна точка, рисуем вертикальную линию
        path += ` L ${pts[0].x} ${height - padding.bottom} Z`;
        return path;
      }

      // Используем кубические кривые Безье с улучшенным контролем для более плавных кривых
      for (let i = 0; i < pts.length - 1; i++) {
        const current = pts[i];
        const next = pts[i + 1];
        
        // Вычисляем контрольные точки для плавного перехода
        let cp1x, cp1y, cp2x, cp2y;
        
        if (i === 0) {
          // Первая точка: контрольная точка направлена к следующей точке
          const dx = (next.x - current.x) * 0.3;
          cp1x = current.x;
          cp1y = current.y;
          cp2x = current.x + dx;
          cp2y = current.y + (next.y - current.y) * 0.3;
        } else if (i === pts.length - 2) {
          // Последняя точка: контрольная точка направлена от предыдущей точки
          const prev = pts[i - 1];
          const dx = (current.x - prev.x) * 0.3;
          cp1x = current.x - dx;
          cp1y = current.y - (current.y - prev.y) * 0.3;
          cp2x = next.x;
          cp2y = next.y;
        } else {
          // Средние точки: используем соседние точки для вычисления контрольных точек
          const prev = pts[i - 1];
          const nextNext = pts[i + 2];
          
          // Направление от предыдущей к следующей точке
          const dx1 = (next.x - prev.x) * 0.2;
          const dy1 = (next.y - prev.y) * 0.2;
          const dx2 = (nextNext ? (nextNext.x - current.x) : (next.x - current.x)) * 0.2;
          const dy2 = (nextNext ? (nextNext.y - current.y) : (next.y - current.y)) * 0.2;
          
          cp1x = current.x - dx1;
          cp1y = current.y - dy1;
          cp2x = current.x + dx2;
          cp2y = current.y + dy2;
        }

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
      }

      // Замыкаем область до нижней границы
      const lastPoint = pts[pts.length - 1];
      path += ` L ${lastPoint.x} ${height - padding.bottom}`;
      path += ` L ${padding.left} ${height - padding.bottom}`;
      path += ' Z';

      return path;
    };

    const path1 = createSmoothPath(points);
    const path2Result = points2.length > 0 ? createSmoothPath(points2) : '';

    return {
      path: path1,
      path2: path2Result,
      maxValue: max,
      minValue: min,
      points,
      points2,
    };
  }, [data, data2, height, showLabels]);

  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <span className="text-neutral-500 text-sm">Нет данных</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {/* Grid lines */}
        {showGrid && (
          <g className="opacity-20">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = height * (1 - ratio);
              return (
                <line
                  key={ratio}
                  x1="4"
                  y1={y}
                  x2="96"
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-neutral-500"
                />
              );
            })}
          </g>
        )}

        {/* Второй слой (если есть) */}
        {path2 && (
          <path
            d={path2}
            fill={color2}
            fillOpacity="0.4"
            className="transition-all duration-300"
          />
        )}

        {/* Первый слой */}
        <path
          d={path}
          fill={color}
          fillOpacity="0.3"
          className="transition-all duration-300"
        />

        {/* Границы (stroke) */}
        {path2 && (
          <path
            d={path2}
            fill="none"
            stroke={color2}
            strokeWidth="0.8"
            strokeOpacity="0.6"
            className="transition-all duration-300"
          />
        )}

        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeOpacity="0.8"
          className="transition-all duration-300"
        />

        {/* Labels */}
        {showLabels &&
          points.map((point, i) => {
            if (i % Math.ceil(points.length / 5) !== 0 && i !== points.length - 1) {
              return null;
            }
            return (
              <text
                key={i}
                x={point.x}
                y={height - 4}
                fontSize="8"
                fill="currentColor"
                className="text-neutral-500"
                textAnchor="middle"
              >
                {point.label || ''}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

