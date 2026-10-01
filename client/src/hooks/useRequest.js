import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '@/api/client.js';

/**
 * Loads data with loading / error / refetch (ADR-014). Re-runs when `deps` change,
 * cancels the in-flight call on change or unmount, and ignores stale responses.
 *
 * @template T
 * @param {(opts: { signal: AbortSignal }) => Promise<T>} fetcher
 * @param {unknown[]} deps
 * @param {{ enabled?: boolean }} [options]
 * @returns {{ data: T|undefined, error: Error|null, loading: boolean,
 *             refetch: () => Promise<void>, setData: (d: T) => void }}
 */
export function useRequest(fetcher, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher; // runs before the load effect below in the same commit
  });
  const controllerRef = useRef(null);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcherRef.current({ signal: controller.signal });
      if (!controller.signal.aborted) setState({ data, error: null, loading: false });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    run();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls re-runs via deps
  }, [enabled, run, ...deps]);

  const setData = useCallback((data) => setState((s) => ({ ...s, data })), []);

  return { ...state, refetch: run, setData };
}
