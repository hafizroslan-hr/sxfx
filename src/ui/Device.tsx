import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { Button } from '../engine/game';
import { Theme } from './themes';

/** Design space of the shell artwork; everything scales from this. */
const DW = 300;
const DH = 520;
const BODY =
  'M50 16 H250 Q300 16 300 66 V400 Q300 512 190 512 H110 Q0 512 0 400 V66 Q0 16 50 16 Z';

// Screen window inside the bezel (design units). Aspect matches the 40x32 LCD + 1-cell margin.
export const LCD_BOX = { x: 52, y: 93, w: 196, h: 154.6 }; // 42x34 incl. margin

const BUTTONS: Record<Button, { cx: number; cy: number; r: number }> = {
  A: { cx: 82, cy: 330, r: 27 },
  B: { cx: 218, cy: 358, r: 35 },
  C: { cx: 150, cy: 440, r: 23 },
};

interface Props {
  width: number;
  theme: Theme;
  led: boolean;
  onPress: (b: Button) => void;
  children: (lcdWidth: number) => ReactNode;
}

export function Device({ width, theme, led, onPress, children }: Props) {
  const k = width / DW;
  const height = DH * k;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${DW} ${DH}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="body" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={theme.body[0]} />
            <Stop offset="1" stopColor={theme.body[1]} />
          </LinearGradient>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#fff" stopOpacity={0.28} />
            <Stop offset="0.25" stopColor="#fff" stopOpacity={0} />
            <Stop offset="0.85" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.22} />
          </LinearGradient>
        </Defs>

        {/* strap loop */}
        <Rect x={122} y={0} width={56} height={30} rx={12} fill={theme.body[1]} />
        <Rect x={136} y={6} width={28} height={10} rx={5} fill="#000" opacity={0.35} />

        <Path d={BODY} fill="url(#body)" />
        {theme.clear && (
          <G opacity={0.35} stroke="#dff1ff" strokeWidth={2} fill="none">
            <Path d="M30 300 H60 V380 H110 M270 300 H240 V410 H200 M150 470 V495 M40 120 V260 M260 120 V260" />
            <Circle cx={110} cy={380} r={4} />
            <Circle cx={200} cy={410} r={4} />
            <Rect x={120} y={290} width={60} height={34} rx={3} />
          </G>
        )}
        <Path d={BODY} fill="url(#sheen)" />
        <Path d={BODY} fill="none" stroke="#000" strokeOpacity={0.25} strokeWidth={2} />

        {/* face plate */}
        <Rect x={24} y={44} width={252} height={232} rx={28} fill={theme.plate} />
        <Rect x={24} y={44} width={252} height={232} rx={28} fill="none" stroke="#000" strokeOpacity={0.12} strokeWidth={2} />
        <SvgText x={40} y={70} fontSize={13} fontWeight="bold" fill={theme.ink} letterSpacing={2}>
          STRIDE
        </SvgText>
        <SvgText x={112} y={70} fontSize={9} fill={theme.ink} letterSpacing={1.5} opacity={0.75}>
          POCKET-3
        </SvgText>
        {/* encounter LED */}
        <Circle cx={256} cy={66} r={7} fill="#000" opacity={0.25} />
        <Circle cx={256} cy={66} r={5.5} fill={led ? '#ff3b30' : '#5a1d1a'} />
        {led && <Circle cx={254} cy={64} r={2} fill="#fff" opacity={0.7} />}

        {/* bezel */}
        <Rect x={40} y={80} width={220} height={180} rx={16} fill={theme.bezel} />
        <Rect x={LCD_BOX.x - 2} y={LCD_BOX.y - 2} width={LCD_BOX.w + 4} height={LCD_BOX.h + 4} rx={4} fill="#000" opacity={0.5} />

        {/* button wells + labels */}
        {(Object.keys(BUTTONS) as Button[]).map((b) => {
          const { cx, cy, r } = BUTTONS[b];
          return (
            <G key={b}>
              <Circle cx={cx} cy={cy + 2} r={r + 7} fill="#000" opacity={0.22} />
              <Circle cx={cx} cy={cy} r={r + 5} fill={theme.body[1]} />
              <SvgText x={cx} y={cy + r + 22} fontSize={12} fontWeight="bold" fill="#fff" opacity={0.85} textAnchor="middle">
                {b}
              </SvgText>
            </G>
          );
        })}

        {/* speaker grille */}
        <G opacity={0.35}>
          {[0, 1, 2, 3].map((i) => (
            <Rect key={i} x={226 + i * 9} y={428 + i * 4} width={5} height={34} rx={2.5} fill="#000" transform={`rotate(-20 ${228 + i * 9} ${445 + i * 4})`} />
          ))}
        </G>
        <SvgText x={150} y={498} fontSize={8} fill="#fff" opacity={0.6} textAnchor="middle" letterSpacing={2}>
          STEP · SHAKE · EVOLVE
        </SvgText>
      </Svg>

      <View
        style={{
          position: 'absolute',
          left: LCD_BOX.x * k,
          top: LCD_BOX.y * k,
          width: LCD_BOX.w * k,
          height: LCD_BOX.h * k,
          overflow: 'hidden',
          borderRadius: 2,
        }}
      >
        {children(LCD_BOX.w * k)}
      </View>

      {(Object.keys(BUTTONS) as Button[]).map((b) => (
        <HwButton key={b} k={k} spec={BUTTONS[b]} theme={theme} big={b === 'B'} label={b} onPress={() => onPress(b)} />
      ))}
    </View>
  );
}

function HwButton({
  k,
  spec,
  theme,
  big,
  label,
  onPress,
}: {
  k: number;
  spec: { cx: number; cy: number; r: number };
  theme: Theme;
  big: boolean;
  label: string;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  const r = spec.r * k;
  const base = big ? theme.bigButton : theme.button;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} button`}
      // Fire on press-in like a real tactile switch: no waiting for release.
      onPressIn={() => {
        setDown(true);
        onPress();
      }}
      onPressOut={() => setDown(false)}
      hitSlop={10 * k}
      style={{
        position: 'absolute',
        left: spec.cx * k - r,
        top: spec.cy * k - r + (down ? 2 * k : 0),
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        backgroundColor: down ? (big ? shade(base) : theme.buttonPressed) : base,
        borderWidth: 2 * k,
        borderColor: 'rgba(0,0,0,0.25)',
        boxShadow: down ? undefined : `0px ${3 * k}px 0px rgba(0,0,0,0.35)`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: r * 1.1,
          height: r * 0.5,
          borderRadius: r,
          backgroundColor: 'rgba(255,255,255,0.35)',
          position: 'absolute',
          top: r * 0.25,
        }}
      />
    </Pressable>
  );
}

function shade(hex: string) {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.8));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}
