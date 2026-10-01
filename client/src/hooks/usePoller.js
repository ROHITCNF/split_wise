import { useEffect, useRef } from 'react';

/**
 * Calls `task` now and then every `intervalMs` while the tab is visible; pauses
 * when hidden and runs again as soon as the tab is shown (ADR-008).
 * @param {() => unknown} task
 * @param {number} intervalMs
 * @param {{ enabled?: boolean }} [options]
 */
export function usePoller(task, intervalMs, { enabled = true } = {}) {
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task; // always call the latest task without restarting the timer
  });

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;

    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      taskRef.current();
      timer = setInterval(() => taskRef.current(), intervalMs);
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}
