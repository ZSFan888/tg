export function createThrottler(minIntervalMs: number) {
  let lastRun = 0;
  let pending: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return function throttle(fn: () => void) {
    const now = Date.now();
    const elapsed = now - lastRun;

    if (elapsed >= minIntervalMs) {
      lastRun = now;
      fn();
      return;
    }

    pending = fn;
    if (timer) return;

    timer = setTimeout(() => {
      timer = null;
      lastRun = Date.now();
      pending?.();
      pending = null;
    }, minIntervalMs - elapsed);
  };
}
