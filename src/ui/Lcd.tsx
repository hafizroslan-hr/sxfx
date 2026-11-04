import { memo, useEffect, useRef, useState } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { H, W } from '../engine/bitmap';
import { FPS, Game } from '../engine/game';

// Static dot-matrix grid drawn over lit pixels so each one reads as an LCD cell.
let GRID = '';
for (let x = 1; x < W; x++) GRID += `M${x} 0V${H}`;
for (let y = 1; y < H; y++) GRID += `M0 ${y}H${W}`;

interface Props {
  game: Game;
  width: number;
  bg: string;
  on: string;
  /** Fires when the "encounter pending" LED state changes. */
  onLed?: (lit: boolean) => void;
}

/**
 * Runs the engine at a fixed 15 fps and only re-renders when the pixel
 * content actually changes, so the JS thread stays mostly idle.
 */
function LcdImpl({ game, width, bg, on, onLed }: Props) {
  const [path, setPath] = useState('');
  const led = useRef(false);

  useEffect(() => {
    let last = Date.now();
    let prevPath = '';
    const id = setInterval(() => {
      const now = Date.now();
      // Clamp dt so a stalled JS thread doesn't fast-forward timers.
      game.tick(Math.min(250, now - last));
      last = now;
      const p = game.render().toPath();
      if (p !== prevPath) {
        prevPath = p;
        setPath(p);
      }
      const lit = !!game.save.pending;
      if (lit !== led.current) {
        led.current = lit;
        onLed?.(lit);
      }
    }, 1000 / FPS);
    return () => clearInterval(id);
  }, [game, onLed]);

  // One cell of margin on every side so edge pixels don't touch the bezel.
  const height = (width * (H + 2)) / (W + 2);
  return (
    <Svg width={width} height={height} viewBox={`-1 -1 ${W + 2} ${H + 2}`}>
      <Rect x={-1} y={-1} width={W + 2} height={H + 2} fill={bg} />
      {/* ghost cells: unlit segments are faintly visible on real LCDs */}
      <Rect x={0} y={0} width={W} height={H} fill={on} opacity={0.06} />
      {/* drop shadow: the liquid crystal layer sits above the reflector */}
      <Path d={path} fill={on} opacity={0.18} transform="translate(0.18 0.22)" />
      <Path d={path} fill={on} opacity={0.92} />
      <Path d={GRID} stroke={bg} strokeWidth={0.13} opacity={0.9} />
    </Svg>
  );
}

export const Lcd = memo(LcdImpl);
