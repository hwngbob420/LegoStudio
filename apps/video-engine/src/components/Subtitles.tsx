import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT, INK} from '../theme';

type Word = {t: number; text: string};
type Line = {id: string; speaker: string; color: string; start: number; end: number; words: Word[]};

// Bold high-contrast subtitles; the active word lights up in the speaker's colour.
export const Subtitles: React.FC<{lines: Line[]; W: number; H: number}> = ({lines, W, H}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const L = lines.find((l) => t >= l.start - 0.08 && t <= l.end + 0.3);
  if (!L) return null;
  const a = interpolate(t, [L.start - 0.08, L.start + 0.04, L.end + 0.18, L.end + 0.3], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const y = interpolate(a, [0, 1], [18, 0]);
  // cân dòng: ước lượng bề rộng chữ, nếu phải xuống dòng thì chia đều để dòng cuối không còn một chữ đứng trơ trọi
  const wordPx = (s: string) => s.length * 52 * 0.6 + 22;
  const total = L.words.reduce((acc, w) => acc + wordPx(w.text), 0);
  const avail = W * 0.76 - 46 - (L.speaker.length * 22 + 70) - 18;
  const nLines = Math.max(1, Math.ceil(total / avail));
  const wrapW = nLines > 1 ? Math.min(avail, Math.ceil(total / nLines) + 60) : undefined;
  return (
    <div style={{position: 'absolute', left: 0, width: W, top: H * 0.835, display: 'flex', justifyContent: 'center', opacity: a,
      transform: `translateY(${y}px)`, fontFamily: FONT}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 18, background: 'rgba(20,22,26,0.82)', border: `5px solid ${INK}`,
        borderRadius: 22, padding: '12px 30px 14px 16px', maxWidth: W * 0.76, boxShadow: '0 8px 0 rgba(0,0,0,0.35)'}}>
        <div style={{background: L.color, color: INK, fontWeight: 900, fontSize: 30, padding: '6px 16px', borderRadius: 12,
          border: `4px solid ${INK}`, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 1}}>
          {L.speaker}
        </div>
        <div style={{fontSize: 52, fontWeight: 900, color: 'white', lineHeight: 1.15, display: 'flex', flexWrap: 'wrap', columnGap: 22, maxWidth: wrapW}}>
          {L.words.map((w, i) => {
            const next = L.words[i + 1]?.t ?? L.end;
            const active = t >= w.t && t < next;
            const said = t >= w.t;
            return (
              <span key={i} style={{color: active ? L.color : said ? 'white' : 'rgba(255,255,255,0.55)',
                transform: active ? 'translateY(-3px) scale(1.03)' : 'none', transformOrigin: '50% 100%', display: 'inline-block'}}>
                {w.text}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
