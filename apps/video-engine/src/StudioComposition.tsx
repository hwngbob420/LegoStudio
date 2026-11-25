// Composition gộp cho Player của Studio: 3D xem trước (Three.js) + lớp chữ + giọng đọc theo mốc giờ.
import React from "react";
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from "remotion";
import { Overlay, type OverlayProps } from "./Overlay";
import { PreviewScene, type PreviewProps } from "./preview/PreviewScene";

export interface StudioProps extends PreviewProps {
  overlay: OverlayProps;
  voice: Record<string, { url: string; start: number }>;
  showOverlay?: boolean;
}

export const StudioComposition: React.FC<StudioProps> = (p) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#0e1116" }}>
      <PreviewScene timeline={p.timeline} library={p.library} assetBase={p.assetBase} />
      {p.showOverlay !== false && p.overlay ? <Overlay {...p.overlay} /> : null}
      {Object.entries(p.voice ?? {}).map(([id, v]) => (
        <Sequence key={id} from={Math.max(0, Math.round(v.start * fps))} layout="none">
          <Audio src={v.url} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export { PreviewScene, Overlay };
export type { PreviewProps, OverlayProps };
