import { Accelerometer, Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

export type StepSource = 'pedometer' | 'shake';

/**
 * Hardware pedometer. Calls onSteps with *deltas*. Returns an unsubscribe fn,
 * or null if no pedometer is available / permission was denied.
 */
export async function startPedometer(onSteps: (delta: number) => void): Promise<(() => void) | null> {
  if (Platform.OS === 'web') return null;
  try {
    if (!(await Pedometer.isAvailableAsync())) return null;
    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) return null;
    let prev = 0;
    const sub = Pedometer.watchStepCount(({ steps }) => {
      // watchStepCount reports a running total since subscription.
      const delta = steps >= prev ? steps - prev : steps;
      prev = steps;
      if (delta > 0) onSteps(delta);
    });
    return () => sub.remove();
  } catch {
    return null;
  }
}

/** iOS keeps 7 days of step history: fetch what happened while the app was closed. */
export async function stepsSince(since: number): Promise<number> {
  if (Platform.OS !== 'ios') return 0;
  const now = Date.now();
  if (now - since < 5000 || now - since > 7 * 24 * 3600 * 1000) return 0;
  try {
    const r = await Pedometer.getStepCountAsync(new Date(since), new Date(now));
    return Math.max(0, Math.min(30000, r.steps));
  } catch {
    return 0;
  }
}

export interface MotionHandlers {
  /** Is the game currently waiting for attack/training shakes? */
  wantsShake: () => boolean;
  /** Should idle motion count as steps (setting + no recent pedometer data)? */
  shakeStepsEnabled: () => boolean;
  onShake: () => void;
  onShakeStep: () => void;
}

/**
 * Accelerometer impulse detector with hysteresis. Two profiles:
 *  - battle: high threshold, fast refractory → counts vigorous shakes
 *  - step:   lower threshold, ~walking cadence → "shake-to-step"
 */
export function startMotion(h: MotionHandlers): () => void {
  let armed = true;
  let lastHit = 0;
  let sub: { remove(): void } | null = null;
  let stopped = false;
  const onSample = ({ x, y, z }: { x: number; y: number; z: number }) => {
    const g = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();
    const battle = h.wantsShake();
    const hi = battle ? 1.7 : 1.35;
    const lo = battle ? 1.25 : 1.1;
    const refractory = battle ? 90 : 280;
    if (!armed) {
      if (g < lo) armed = true;
      return;
    }
    if (g > hi && now - lastHit > refractory) {
      armed = false;
      lastHit = now;
      if (battle) h.onShake();
      else if (h.shakeStepsEnabled()) h.onShakeStep();
    }
  };
  // Some platforms (desktop browsers, simulators) have no accelerometer:
  // motion is optional, the B button stands in for shakes.
  Accelerometer.isAvailableAsync()
    .then((ok) => {
      if (!ok || stopped) return;
      Accelerometer.setUpdateInterval(20);
      sub = Accelerometer.addListener(onSample);
    })
    .catch(() => {});
  return () => {
    stopped = true;
    sub?.remove();
  };
}
