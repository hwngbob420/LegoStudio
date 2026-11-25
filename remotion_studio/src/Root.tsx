import React from 'react';
import {Composition} from 'remotion';
import {Overlay, OverlayProps} from './Overlay';
import sample from './sample_props.json';

export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
