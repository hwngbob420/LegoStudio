import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {FONT, INK, PAPER, MANUAL_BLUE, STEP_BLUE, OUTLINE, SHADOW, px} from '../theme';
import {Brick, Mug} from './Brick';

// shared enter/exit: snappy spring pop in, quick snap out
export const usePop = (t0: number, t1: number) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const inS = spring({frame: frame - t0 * fps, fps, config: {damping: 11, stiffness: 190, mass: 0.7}});
  const out = interpolate(t, [t1 - 0.18, t1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.back(2))});
  return {s: inS * out, t, visible: t >= t0 - 0.01 && t <= t1 + 0.01, local: t - t0};
};

const cardBase: React.CSSProperties = {
  position: 'absolute',
  background: PAPER,
  border: `${OUTLINE}px solid ${INK}`,
  borderRadius: 26,
  boxShadow: `10px 12px 0 ${SHADOW}`,
  fontFamily: FONT,
  color: INK,
  boxSizing: 'border-box',
};

export const StepBadge: React.FC<{cue: any; W: number; H: number}> = ({cue, W, H}) => {
  const {s, visible, local} = usePop(cue.t0, cue.t1);
  if (!visible) return null;
  const r = px(cue.rect, W, H);
  const h = Math.min(r.height, 170);
  const check = cue.check && local > 0.6 ? spring({frame: (local - 0.6) * 60, fps: 60, config: {damping: 9}}) : 0;
  return (
    <div style={{...cardBase, left: r.left, top: r.top, height: h, display: 'flex', alignItems: 'center', gap: 22, padding: '0 34px 0 18px',
      transform: `scale(${s}) rotate(${(1 - s) * -8}deg)`, transformOrigin: 'left center'}}>
      <div style={{position: 'relative', width: 150, height: h - 36, background: STEP_BLUE, border: `${OUTLINE}px solid ${INK}`, borderRadius: 16,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white'}}>
        {[0, 1].map((i) => (
          <div key={i} style={{position: 'absolute', top: -22, left: 26 + i * 62, width: 36, height: 22, background: STEP_BLUE,
            border: `5px solid ${INK}`, borderBottom: 'none', borderRadius: '8px 8px 0 0',
            transform: `translateY(${interpolate(local, [0.05 + i * 0.07, 0.2 + i * 0.07], [-30, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}px)`}} />
        ))}
        <div style={{fontSize: 26, fontWeight: 900, letterSpacing: 4, lineHeight: 1}}>STEP</div>
        <div style={{fontSize: 74, fontWeight: 900, lineHeight: 0.95}}>{cue.step}</div>
      </div>
      <div style={{fontSize: 58, fontWeight: 900, whiteSpace: 'nowrap'}}>{cue.title}</div>
      {cue.check ? (
        <div style={{width: 74, height: 74, borderRadius: 37, background: '#3E9D4A', border: `${OUTLINE}px solid ${INK}`, display: 'flex',
          alignItems: 'center', justifyContent: 'center', transform: `scale(${check})`}}>
          <svg width={44} height={44} viewBox="0 0 44 44"><path d="M8 23 l10 10 l19 -22" stroke="white" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      ) : null}
    </div>
  );
};

export const PartCallout: React.FC<{cue: any; W: number; H: number}> = ({cue, W, H}) => {
  const {s, visible, local} = usePop(cue.t0, cue.t1);
  if (!visible) return null;
  const r = px(cue.rect, W, H);
  const w = r.width;
  const icons = Array.from({length: cue.count});
  const countShown = Math.min(cue.count, Math.max(0, Math.floor((local - 0.15) / 0.22) + 1));
  return (
    <div style={{...cardBase, left: r.left, top: r.top + r.height * 0.08, width: w, padding: 28, background: MANUAL_BLUE,
      transform: `scale(${s})`, transformOrigin: 'center top'}}>
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 10, minHeight: 130}}>
        {icons.map((_, i) => {
          const k = spring({frame: (local - 0.15 - i * 0.22) * 60, fps: 60, config: {damping: 8, stiffness: 220}});
          return (
            <div key={i} style={{transform: `translateY(${(1 - k) * -70}px) scale(${0.4 + 0.6 * k})`, opacity: k > 0.02 ? 1 : 0}}>
              <Mug size={118} color={['#FFFFFF', '#E0352B', '#0F6C77'][i % 3]} />
            </div>
          );
        })}
      </div>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 10}}>
        <div style={{fontSize: 110, fontWeight: 900, lineHeight: 1}}>x{countShown}</div>
        <div style={{fontSize: 56, fontWeight: 900}}>{cue.label}</div>
      </div>
      <div style={{marginTop: 18, display: 'inline-block', padding: '8px 20px', background: '#FFE3E0', border: `5px solid ${INK}`, borderRadius: 14,
        fontSize: 38, fontWeight: 900, color: '#C0261D', transform: `rotate(-2deg) scale(${interpolate(local, [0.9, 1.1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})})`}}>
        {cue.note}
      </div>
    </div>
  );
};

export const BrickChart: React.FC<{cue: any; W: number; H: number}> = ({cue, W, H}) => {
  const {s, visible, t} = usePop(cue.t0, cue.t1);
  if (!visible) return null;
  const r = px(cue.rect, W, H);
  const brickH = 40;
  const barW = (r.width - 120) / cue.bars.length;
  const floorY = r.height - 120;
  return (
    <div style={{...cardBase, left: r.left, top: r.top, width: r.width, height: r.height, transform: `scale(${s})`, transformOrigin: 'center bottom', overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 30, top: 18, fontSize: 46, fontWeight: 900}}>{cue.title}</div>
      {/* hand-drawn axis */}
      <svg style={{position: 'absolute', left: 0, top: 0}} width={r.width} height={r.height}>
        <path d={`M40 ${floorY + 6} q ${r.width / 2} 6 ${r.width - 70} -2`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />
        <path d={`M44 ${floorY + 8} q -4 -${floorY / 2} 2 -${floorY - 90}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />
      </svg>
      {cue.bars.map((b: any, bi: number) => {
        const x = 70 + bi * barW + (barW - (barW * 0.72)) / 2;
        const bw = barW * 0.72;
        const collapsed = b.collapse_t !== undefined && t >= b.collapse_t;
        return (
          <React.Fragment key={bi}>
            {Array.from({length: b.value}).map((_, k) => {
              const ts = b.t + k * 0.06;
              const fall = spring({frame: (t - ts) * 60, fps: 60, config: {damping: 10, stiffness: 260, mass: 0.6}});
              if (t < ts) return null;
              let y = floorY - (k + 1) * brickH - (1 - fall) * 120;
              let x2 = x;
              let rot = 0;
              if (collapsed) {
                const u = t - b.collapse_t;
                const dir = k % 3 === 0 ? -0.35 : 1;
                const delay = Math.max(0, u - (b.value - k) * 0.025);
                const rest = floorY - brickH * (0.75 + (k % 3) * 0.55) - 2;
                y = Math.min(rest, y + 900 * delay * delay + 30 * delay * (b.value - k));
                x2 = x + dir * (20 + k * 9) * Math.min(1, delay * 3);
                rot = (k % 2 ? 1 : -1) * Math.min(70 + k * 12, delay * 600);
              }
              return (
                <div key={k} style={{position: 'absolute', left: x2, top: y, transform: `rotate(${rot}deg)`}}>
                  <Brick w={bw} h={brickH - 6} color={b.color} studs={2} />
                </div>
              );
            })}
            <div style={{position: 'absolute', left: x - 10, top: floorY + 22, width: bw + 20, textAlign: 'center', fontSize: 44, fontWeight: 900}}>
              {b.label}
            </div>
            {collapsed ? (
              <div style={{position: 'absolute', left: x + bw * 0.05, top: floorY - 340, fontSize: 96, fontWeight: 900, color: '#D7261E',
                transform: `scale(${spring({frame: (t - b.collapse_t - 0.25) * 60, fps: 60, config: {damping: 7}})}) rotate(-10deg)`, WebkitTextStroke: `4px ${INK}`}}>
                ?!
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const HandArrow: React.FC<{cue: any; W: number; H: number}> = ({cue, W, H}) => {
  const frame = useCurrentFrame();
  const t = frame / 60;
  if (t < cue.t0 || t > cue.t1) return null;
  const [x0, y0] = [cue.from[0] * W, cue.from[1] * H];
  const [x1, y1] = [cue.to[0] * W, cue.to[1] * H];
  const mx = (x0 + x1) / 2 + (y1 - y0) * 0.35;
  const my = (y0 + y1) / 2 - (x1 - x0) * 0.35;
  const d = `M${x0} ${y0} Q${mx} ${my} ${x1} ${y1}`;
  const len = 900;
  const p = interpolate(t - cue.t0, [0, 0.35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const ang = Math.atan2(y1 - my, x1 - mx);
  const head = (s: number) => `M${x1 - 46 * Math.cos(ang - s)} ${y1 - 46 * Math.sin(ang - s)} L${x1} ${y1} L${x1 - 46 * Math.cos(ang + s)} ${y1 - 46 * Math.sin(ang + s)}`;
  const wob = Math.sin(t * 9) * 3;
  return (
    <svg style={{position: 'absolute', left: 0, top: 0}} width={W} height={H}>
      <g transform={`translate(${wob * 0.5}, ${wob})`}>
        <path d={d} stroke="white" strokeWidth={22} fill="none" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
        <path d={d} stroke={INK} strokeWidth={11} fill="none" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
        {p > 0.95 ? (
          <>
            <path d={head(0.5)} stroke="white" strokeWidth={22} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={head(0.5)} stroke={INK} strokeWidth={11} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : null}
      </g>
    </svg>
  );
};
