// Brick Instruction Manual + Whiteboard explainer grammar
import {loadFont} from '@remotion/google-fonts/Nunito';

const {fontFamily} = loadFont('normal', {weights: ['800', '900'], subsets: ['latin']});

export const FONT = `${fontFamily}, 'Segoe UI', Arial, sans-serif`;
export const INK = '#1B1D21';
export const PAPER = '#FFFDF7';
export const MANUAL_BLUE = '#D9ECFF';
export const STEP_BLUE = '#1E6FD9';
export const SHADOW = 'rgba(27,29,33,0.9)';
export const OUTLINE = 6;

export const px = (r: number[], W: number, H: number) => ({
  left: r[0] * W,
  top: r[1] * H,
  width: (r[2] - r[0]) * W,
  height: (r[3] - r[1]) * H,
});
