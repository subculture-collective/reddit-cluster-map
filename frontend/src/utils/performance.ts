/**
 * Performance monitoring utilities for tracking interaction performance
 */

export interface PerformanceStats {
  raycastTime: number;
  hoverUpdateTime: number;
  selectionUpdateTime: number;
  count: number;
}

class PerformanceMonitor {
  private stats: Map<string, PerformanceStats> = new Map();
  private enabled = false;

  constructor() {
    // Enable in development or when explicitly enabled
    this.enabled = import.meta.env.DEV || false;
  }

  /**
   * Measure execution time of a function
   */
  measure<T>(label: string, fn: () => T): T {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    this.recordStat(label, duration);
    return result;
  }

  /**
   * Measure async execution time
   */
  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    this.recordStat(label, duration);
    return result;
  }

  /**
   * Record a performance stat
   */
  private recordStat(label: string, duration: number): void {
    const existing = this.stats.get(label);
    if (existing) {
      existing.raycastTime = duration;
      existing.count++;
    } else {
      this.stats.set(label, {
        raycastTime: duration,
        hoverUpdateTime: 0,
        selectionUpdateTime: 0,
        count: 1,
      });
    }

    // Log if duration exceeds threshold
    if (duration > 16.67) { // More than one frame at 60fps
      console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms (> 16.67ms frame budget)`);
    }
  }

  /**
   * Get stats for a specific label
   */
  getStats(label: string): PerformanceStats | undefined {
    return this.stats.get(label);
  }

  /**
   * Get all stats
   */
  getAllStats(): Map<string, PerformanceStats> {
    return new Map(this.stats);
  }

  /**
   * Clear all stats
   */
  clearStats(): void {
    this.stats.clear();
  }

  /**
   * Log summary of all stats
   */
  logSummary(): void {
    if (!this.enabled || this.stats.size === 0) {
      return;
    }

    console.group('[Performance Summary]');
    for (const [label, stat] of this.stats.entries()) {
      const avg = stat.raycastTime;
      console.log(`${label}: ${avg.toFixed(2)}ms (${stat.count} calls)`);
    }
    console.groupEnd();
  }
}

// Global instance
export const perfMonitor = new PerformanceMonitor();

// Auto-log summary every 10 seconds in dev mode
if (import.meta.env.DEV) {
  setInterval(() => {
    perfMonitor.logSummary();
    perfMonitor.clearStats();
  }, 10000);
}
