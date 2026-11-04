import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Button, Game, GameHost } from './src/engine/game';
import { initSound, playSfx } from './src/platform/sound';
import { StepSource, startMotion, startPedometer, stepsSince } from './src/platform/sensors';
import { useStore } from './src/state/store';
import { Device } from './src/ui/Device';
import { Lcd } from './src/ui/Lcd';
import { THEMES } from './src/ui/themes';

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {hydrated ? <Handheld /> : null}
    </View>
  );
}

/** While the pedometer reported recently, accelerometer bumps are not counted as steps. */
const PEDOMETER_QUIET_MS = 3000;

function Handheld() {
  const { width, height } = useWindowDimensions();
  const gameRef = useRef<Game | null>(null);
  const lastPedometer = useRef(0);
  const [led, setLed] = useState(false);
  const [source, setSource] = useState<StepSource>('shake');

  if (!gameRef.current) {
    const host: GameHost = {
      save: (s) => useStore.getState().setSave(s),
      sfx: (x) => {
        if (!gameRef.current?.save.settings.muted) playSfx(x);
      },
      haptic: (kind) => {
        if (Platform.OS === 'web') return;
        Haptics.impactAsync(kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      },
    };
    gameRef.current = new Game(host, useStore.getState().save ?? undefined);
  }
  const game = gameRef.current;
  const shell = useStore((s) => s.save?.settings.shell ?? 'cobalt');
  const theme = THEMES[shell];

  // Sensors + lifecycle.
  useEffect(() => {
    initSound();
    let stopPedo: (() => void) | null = null;
    let cancelled = false;

    // iOS: credit steps walked while the app was closed (CoreMotion keeps 7 days).
    const since = game.save.lastSeen;
    (since ? stepsSince(since) : Promise.resolve(0)).then((n) => {
      if (n > 0) game.addSteps(n);
      game.touch(Date.now());
    });

    startPedometer((delta) => {
      lastPedometer.current = Date.now();
      game.addSteps(delta);
      game.touch(Date.now());
    }).then((stop) => {
      if (cancelled) stop?.();
      else {
        stopPedo = stop;
        setSource(stop ? 'pedometer' : 'shake');
      }
    });

    const stopMotion = startMotion({
      wantsShake: () => game.wantsShake,
      shakeStepsEnabled: () =>
        game.save.settings.shakeSteps && Date.now() - lastPedometer.current > PEDOMETER_QUIET_MS,
      onShake: () => game.shake(),
      onShakeStep: () => game.addSteps(1),
    });

    const heartbeat = setInterval(() => game.touch(Date.now()), 15000);
    const appSub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') game.touch(Date.now());
    });

    return () => {
      cancelled = true;
      stopPedo?.();
      stopMotion();
      clearInterval(heartbeat);
      appSub.remove();
    };
  }, [game]);

  const onPress = useCallback(
    (b: Button) => {
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      game.press(b);
    },
    [game],
  );

  // Desktop/web convenience: keyboard controls and a simulated walk.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') onPress('A');
      else if (k === 'b' || k === 'enter' || k === 'arrowright') onPress('B');
      else if (k === 'c' || k === 'escape' || k === 'backspace') onPress('C');
      else if (k === ' ') game.wantsShake ? game.shake() : game.addSteps(1);
      else if (k === 's') game.addSteps(25);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, onPress]);

  const deviceW = Math.min(width - 32, (height - 80) * (300 / 520), 420);

  return (
    <View style={styles.center}>
      <Device width={deviceW} theme={theme} led={led} onPress={onPress}>
        {(w) => <Lcd game={game} width={w} bg={theme.lcdBg} on={theme.lcdOn} onLed={setLed} />}
      </Device>
      <Text style={styles.caption}>
        {source === 'pedometer' ? 'PEDOMETER ACTIVE' : 'SHAKE TO WALK'} · SHAKE IN BATTLE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14161b' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  caption: {
    marginTop: 14,
    color: '#8a90a0',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '600',
  },
});
