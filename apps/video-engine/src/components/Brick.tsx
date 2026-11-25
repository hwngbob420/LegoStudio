import React from 'react';
import {INK} from '../theme';

// Flat instruction-manual brick: rounded body + plain studs (no logos), thick ink outline.
export const Brick: React.FC<{
  w: number;
  h: number;
  color: string;
  studs?: number;
  style?: React.CSSProperties;
}> = ({w, h, color, studs = 2, style}) => {
  const studW = Math.min(w / (studs * 1.7), h * 0.55);
  const studH = studW * 0.42;
  return (
    <svg width={w + 8} height={h + studH + 8} style={{overflow: 'visible', ...style}}>
      <g transform={`translate(4, ${studH + 4})`}>
        {Array.from({length: studs}).map((_, i) => {
          const cx = (w / studs) * (i + 0.5);
          return (
            <rect
              key={i}
              x={cx - studW / 2}
              y={-studH}
              width={studW}
              height={studH + 6}
              rx={studW * 0.18}
              fill={color}
              stroke={INK}
              strokeWidth={3.5}
            />
          );
        })}
        <rect x={0} y={0} width={w} height={h} rx={Math.min(10, h * 0.2)} fill={color} stroke={INK} strokeWidth={4} />
        <rect x={6} y={5} width={w - 12} height={Math.max(3, h * 0.14)} rx={3} fill="rgba(255,255,255,0.35)" />
      </g>
    </svg>
  );
};

export const Mug: React.FC<{size: number; color?: string}> = ({size, color = '#FFFFFF'}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{overflow: 'visible'}}>
    <path d="M70 38 q22 0 22 18 q0 18 -22 18" fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" />
    <rect x={14} y={26} width={60} height={62} rx={10} fill={color} stroke={INK} strokeWidth={7} />
    <rect x={14} y={26} width={60} height={14} rx={6} fill="#7B4A2A" stroke={INK} strokeWidth={6} />
    <path d="M32 18 q-6 -8 0 -14 M46 18 q-6 -8 0 -14 M60 18 q-6 -8 0 -14" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.6} />
  </svg>
);
