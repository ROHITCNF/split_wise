import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRequest } from './useRequest.js';
import { usePoller } from './usePoller.js';

describe('useRequest', () => {
  it('loads data and exposes refetch', async () => {
    let n = 0;
    const { result } = renderHook(() => useRequest(async () => ++n, []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe(1));
    expect(result.current.loading).toBe(false);
    await act(() => result.current.refetch());
    expect(result.current.data).toBe(2);
  });

  it('exposes errors', async () => {
    const { result } = renderHook(() =>
      useRequest(async () => Promise.reject(new Error('boom')), []),
    );
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.loading).toBe(false);
  });

  it('aborts the previous call when deps change and ignores its late answer', async () => {
    const resolvers = {};
    const signals = {};
    const fetcher =
      (id) =>
      ({ signal }) => {
        signals[id] = signal;
        return new Promise((resolve) => (resolvers[id] = resolve));
      };
    const { result, rerender } = renderHook(({ id }) => useRequest(fetcher(id), [id]), {
      initialProps: { id: 'a' },
    });
    rerender({ id: 'b' });
    expect(signals.a.aborted).toBe(true);

    await act(async () => resolvers.b('B'));
    await act(async () => resolvers.a('A (stale)'));
    expect(result.current.data).toBe('B');
  });

  it('aborts on unmount', () => {
    let signal;
    const { unmount } = renderHook(() =>
      useRequest((opts) => {
        signal = opts.signal;
        return new Promise(() => {});
      }, []),
    );
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('does nothing while disabled', () => {
    const fetcher = vi.fn();
    const { result } = renderHook(() => useRequest(fetcher, [], { enabled: false }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});

describe('usePoller (ADR-008)', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  const setVisibility = (state) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('runs now and every interval while visible; pauses when hidden; resumes on show', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    renderHook(() => usePoller(task, 60_000));
    expect(task).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(task).toHaveBeenCalledTimes(2);

    act(() => setVisibility('hidden'));
    vi.advanceTimersByTime(180_000);
    expect(task).toHaveBeenCalledTimes(2);

    act(() => setVisibility('visible'));
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('stops on unmount', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const { unmount } = renderHook(() => usePoller(task, 1000));
    unmount();
    vi.advanceTimersByTime(5000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
