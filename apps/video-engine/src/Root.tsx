import React from 'react';
import {Composition} from 'remotion';
import {Overlay, OverlayProps} from './Overlay';
import {PreviewScene, type PreviewProps} from './preview/PreviewScene';
import sample from './sample_props.json';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Overlay"
        component={Overlay}
        width={1920}
        height={1080}
        fps={60}
        durationInFrames={600}
        defaultProps={sample as unknown as OverlayProps}
        calculateMetadata={({props}) => ({
          fps: props.fps,
          width: props.width,
          height: props.height,
          durationInFrames: Math.ceil(props.duration * props.fps),
        })}
      />
      <Composition
        id="Preview"
        component={PreviewScene as unknown as React.FC<Record<string, unknown>>}
        width={1920}
        height={1080}
        fps={60}
        durationInFrames={60}
        defaultProps={{} as Record<string, unknown>}
        calculateMetadata={({props}) => {
          const p = props as unknown as PreviewProps;
          if (!p.timeline) return {};
          return {
            fps: p.timeline.fps_out,
            width: p.timeline.resolution[0],
            height: p.timeline.resolution[1],
            durationInFrames: Math.ceil(p.timeline.duration * p.timeline.fps_out),
          };
        }}
      />
    </>
  );
};
