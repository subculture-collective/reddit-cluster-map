/**
 * Frame throttling utilities for performance optimization.
 * Reduces rendering frequency when the graph is idle.
 */

export interface FrameThrottleOptions {
  /**
   * Target FPS when active (default: 60)
   */
  activeFps?: number;
  
  /**
   * Target FPS when idle (default: 10)
   */
  idleFps?: number;
  
  /**
   * Time in ms before considering the graph idle (default: 2000)
   */
  idleTimeout?: number;
}

export class FrameThrottler {
  private isIdle = false;
  /** Tracks whether the throttler is currently active (started and not stopped) */
  private isActive = false;
  private lastInteraction = Date.now();
  private lastFrame = 0;
  private rafId: number | null = null;
  private idleCheckInterval: number | null = null;
  
  private activeFps: number;
  private idleFps: number;
  private idleTimeout: number;
  
  constructor(options: FrameThrottleOptions = {}) {
    this.activeFps = options.activeFps ?? 60;
    this.idleFps = options.idleFps ?? 10;
    this.idleTimeout = options.idleTimeout ?? 2000;
  }
  
  /**
   * Mark the graph as active (user is interacting)
   */
  markActive(): void {
    this.lastInteraction = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
    }
  }
  
  /**
   * Check if enough time has passed since last interaction
   */
  private checkIdle(): void {
    const now = Date.now();
    const timeSinceInteraction = now - this.lastInteraction;
    this.isIdle = timeSinceInteraction >= this.idleTimeout;
  }
  
  /**
   * Start the frame loop with throttling
   */
  start(callback: (time: number) => void): void {
    this.stop();
    this.isActive = true;
    
    // Check idle state periodically
    this.idleCheckInterval = window.setInterval(() => {
      // Only check idle state if throttler is still active
      if (this.isActive) {
        this.checkIdle();
      }
    }, 500);
    
    const loop = (time: number) => {
      this.rafId = requestAnimationFrame(loop);
      
      const targetFps = this.isIdle ? this.idleFps : this.activeFps;
      const targetInterval = 1000 / targetFps;
      
      if (time - this.lastFrame >= targetInterval) {
        this.lastFrame = time;
        callback(time);
      }
    };
    
    this.rafId = requestAnimationFrame(loop);
  }
  
  /**
   * Stop the frame loop
   */
  stop(): void {
    this.isActive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.idleCheckInterval !== null) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }
  
  /**
   * Get current idle state
   */
  getIsIdle(): boolean {
    return this.isIdle;
  }
}
