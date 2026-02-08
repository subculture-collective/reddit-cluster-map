import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameThrottler } from './frameThrottle';

describe('FrameThrottler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates throttler with default options', () => {
    const throttler = new FrameThrottler();
    expect(throttler).toBeDefined();
    expect(throttler.getIsIdle()).toBe(false);
  });

  it('creates throttler with custom options', () => {
    const throttler = new FrameThrottler({
      activeFps: 30,
      idleFps: 5,
      idleTimeout: 1000,
    });
    expect(throttler).toBeDefined();
  });

  it('marks as active and resets idle state', () => {
    const throttler = new FrameThrottler({ idleTimeout: 100 });
    
    throttler.start(() => {});
    
    // Fast forward to make it idle
    vi.advanceTimersByTime(200);
    
    // Mark as active
    throttler.markActive();
    
    // Should not be idle anymore
    expect(throttler.getIsIdle()).toBe(false);
    
    throttler.stop();
  });

  it('starts frame loop and calls callback', () => {
    const callback = vi.fn();
    const throttler = new FrameThrottler();
    
    throttler.start(callback);
    
    // Advance time and trigger RAF
    vi.advanceTimersByTime(100);
    
    // Stop to clean up
    throttler.stop();
    
    expect(callback).toHaveBeenCalled();
  });

  it('stops frame loop', () => {
    const callback = vi.fn();
    const throttler = new FrameThrottler();
    
    throttler.start(callback);
    throttler.stop();
    
    // Clear previous calls
    callback.mockClear();
    
    // Advance time
    vi.advanceTimersByTime(100);
    
    // Callback should not be called after stop
    expect(callback).not.toHaveBeenCalled();
  });

  it('transitions to idle state after timeout', () => {
    const throttler = new FrameThrottler({ idleTimeout: 1000 });
    
    throttler.start(() => {});
    
    expect(throttler.getIsIdle()).toBe(false);
    
    // Advance past idle timeout
    vi.advanceTimersByTime(1500);
    
    expect(throttler.getIsIdle()).toBe(true);
    
    throttler.stop();
  });

  it('can be stopped and restarted', () => {
    const callback = vi.fn();
    const throttler = new FrameThrottler();
    
    // Start
    throttler.start(callback);
    vi.advanceTimersByTime(100);
    const firstCallCount = callback.mock.calls.length;
    
    // Stop
    throttler.stop();
    callback.mockClear();
    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();
    
    // Restart
    throttler.start(callback);
    vi.advanceTimersByTime(100);
    const secondCallCount = callback.mock.calls.length;
    
    expect(firstCallCount).toBeGreaterThan(0);
    expect(secondCallCount).toBeGreaterThan(0);
    
    throttler.stop();
  });
});
