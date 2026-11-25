import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {StepBadge, PartCallout, BrickChart, HandArrow} from './components/Cards';
import {Subtitles} from './components/Subtitles';

export type OverlayProps = {
  fps: number;
  duration: number;
  width: number;
  height: number;
  cues: any[];
  subtitles: any[];
  shots: {id: string; t0: number; t1: number}[];
};

const REGISTRY: Record<string, React.FC<{cue: any; W: number; H: number}>> = {
  step_badge: StepBadge,
  part_callout: PartCallout,
  brick_chart: BrickChart,
  arrow: HandArrow,
};

// Transparent layer: rendered with alpha and composited over the Blender plate by FFmpeg.
export const Overlay: React.FC<OverlayProps> = ({cues, subtitles}) => {
  const {width: W, height: H} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: 'transparent'}}>
      {cues.map((c, i) => {
        const C = REGISTRY[c.type];
        return C ? <C key={i} cue={c} W={W} H={H} /> : null;
      })}
      <Subtitles lines={subtitles} W={W} H={H} />
    </AbsoluteFill>
  );
};
