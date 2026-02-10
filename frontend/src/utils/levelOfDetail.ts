/**
 * Level-of-detail (LOD) configuration for adaptive rendering.
 * Controls visibility and quality of graph elements based on view state.
 */

/**
 * LOD Tier levels (0 = emergency, 3 = highest quality)
 */
export enum LODTier {
  EMERGENCY = 0,  // Subsample to 10k points, no links
  LOW = 1,        // Points only, no links
  MEDIUM = 2,     // Flat circles (sprites), no labels, partial links
  HIGH = 3,       // Full spheres, labels, all links
}

export interface LODConfig {
  /**
   * Camera distance threshold for showing all links
   */
  linkVisibilityThreshold: number;
  
  /**
   * Camera distance threshold for showing labels
   */
  labelVisibilityThreshold: number;
  
  /**
   * Maximum number of labels to show
   */
  maxLabels: number;
  
  /**
   * Minimum node degree to show label
   */
  minLabelDegree: number;
  
  /**
   * Link opacity when at max distance
   */
  minLinkOpacity: number;
  
  /**
   * Link opacity when at close distance
   */
  maxLinkOpacity: number;
  
  /**
   * Enable adaptive LOD system
   */
  enableAdaptiveLOD: boolean;
  
  /**
   * FPS threshold for downgrading LOD tier
   */
  fpsDowngradeThreshold: number;
  
  /**
   * FPS threshold for upgrading LOD tier
   */
  fpsUpgradeThreshold: number;
  
  /**
   * Time (ms) to wait below threshold before downgrading
   */
  downgradeDelayMs: number;
  
  /**
   * Time (ms) to wait above threshold before upgrading
   */
  upgradeDelayMs: number;
  
  /**
   * Transition duration (ms) for smooth LOD changes
   */
  transitionDurationMs: number;
  
  /**
   * Camera distance thresholds for per-node LOD tiers
   */
  distanceTiers: {
    close: number;    // < close: Tier 3
    medium: number;   // < medium: Tier 2
    far: number;      // < far: Tier 1, >= far: Tier 0
  };
}

export const DEFAULT_LOD_CONFIG: LODConfig = {
  linkVisibilityThreshold: 1200,
  labelVisibilityThreshold: 800,
  maxLabels: 200,
  minLabelDegree: 2,
  minLinkOpacity: 0.1,
  maxLinkOpacity: 0.8,
  enableAdaptiveLOD: true,
  fpsDowngradeThreshold: 24,
  fpsUpgradeThreshold: 50,
  downgradeDelayMs: 2000,
  upgradeDelayMs: 5000,
  transitionDurationMs: 500,
  distanceTiers: {
    close: 500,
    medium: 1000,
    far: 2000,
  },
};

/**
 * Calculate adaptive link opacity based on camera distance
 */
export function calculateLinkOpacity(
  cameraDistance: number,
  baseOpacity: number,
  config: LODConfig = DEFAULT_LOD_CONFIG
): number {
  if (cameraDistance < config.linkVisibilityThreshold / 2) {
    return Math.min(config.maxLinkOpacity, baseOpacity);
  }
  
  const ratio = Math.max(
    0,
    1 - (cameraDistance - config.linkVisibilityThreshold / 2) / config.linkVisibilityThreshold
  );
  
  return Math.max(
    config.minLinkOpacity,
    Math.min(config.maxLinkOpacity, baseOpacity * ratio)
  );
}

/**
 * Determine if labels should be visible based on camera distance
 */
export function shouldShowLabels(
  cameraDistance: number,
  config: LODConfig = DEFAULT_LOD_CONFIG
): boolean {
  return cameraDistance < config.labelVisibilityThreshold;
}

/**
 * Determine if a specific link should be visible
 */
export function shouldShowLink(
  cameraDistance: number,
  isSelected: boolean,
  config: LODConfig = DEFAULT_LOD_CONFIG
): boolean {
  // Always show links connected to selected nodes
  if (isSelected) return true;
  
  // Show all links when camera is close
  return cameraDistance < config.linkVisibilityThreshold;
}

/**
 * Calculate LOD tier based on camera distance
 */
export function calculateDistanceLODTier(
  cameraDistance: number,
  config: LODConfig = DEFAULT_LOD_CONFIG
): LODTier {
  if (cameraDistance < config.distanceTiers.close) {
    return LODTier.HIGH;
  } else if (cameraDistance < config.distanceTiers.medium) {
    return LODTier.MEDIUM;
  } else if (cameraDistance < config.distanceTiers.far) {
    return LODTier.LOW;
  } else {
    return LODTier.EMERGENCY;
  }
}

/**
 * Calculate transition progress (0-1) for smooth LOD changes
 */
export function calculateTransitionProgress(
  startTime: number,
  currentTime: number,
  duration: number
): number {
  const elapsed = currentTime - startTime;
  return Math.min(1, Math.max(0, elapsed / duration));
}

/**
 * Adaptive LOD Manager
 * 
 * Tracks FPS and automatically adjusts LOD tier to maintain target framerate.
 * Includes hysteresis to prevent oscillation between tiers.
 */
export class AdaptiveLODManager {
  private config: LODConfig;
  private fpsHistory: number[] = [];
  private currentTier: LODTier = LODTier.HIGH;
  private targetTier: LODTier = LODTier.HIGH;
  private transitionStartTime: number = 0;
  private lastTierChangeTime: number = 0;
  private belowThresholdStartTime: number = 0;
  private aboveThresholdStartTime: number = 0;
  private isTransitioning: boolean = false;
  
  constructor(config: LODConfig = DEFAULT_LOD_CONFIG) {
    this.config = { ...config };
  }
  
  /**
   * Update configuration
   */
  public setConfig(config: Partial<LODConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  public getConfig(): LODConfig {
    return { ...this.config };
  }
  
  /**
   * Record a frame's timing for FPS calculation
   */
  public recordFrame(fps: number): void {
    if (!this.config.enableAdaptiveLOD) return;
    
    this.fpsHistory.push(fps);
    
    // Keep only last 60 frames (1 second at 60fps)
    if (this.fpsHistory.length > 60) {
      this.fpsHistory.shift();
    }
  }
  
  /**
   * Get current average FPS
   */
  public getAverageFPS(): number {
    if (this.fpsHistory.length === 0) return 60;
    
    return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
  }
  
  /**
   * Update LOD tier based on FPS and time thresholds
   */
  public update(currentTime: number): void {
    if (!this.config.enableAdaptiveLOD) return;
    
    const avgFPS = this.getAverageFPS();
    
    // Handle ongoing transition
    if (this.isTransitioning) {
      const progress = calculateTransitionProgress(
        this.transitionStartTime,
        currentTime,
        this.config.transitionDurationMs
      );
      
      if (progress >= 1) {
        // Transition complete
        this.currentTier = this.targetTier;
        this.isTransitioning = false;
      }
      return;
    }
    
    // Check if we need to downgrade
    if (avgFPS < this.config.fpsDowngradeThreshold) {
      if (this.belowThresholdStartTime === 0) {
        this.belowThresholdStartTime = currentTime;
      }
      
      const timeBelowThreshold = currentTime - this.belowThresholdStartTime;
      
      // Downgrade if below threshold for required time and not at minimum tier
      if (timeBelowThreshold >= this.config.downgradeDelayMs && this.currentTier > LODTier.EMERGENCY) {
        this.startTransition(this.currentTier - 1, currentTime);
        this.belowThresholdStartTime = 0;
        this.aboveThresholdStartTime = 0;
      }
    } else {
      this.belowThresholdStartTime = 0;
    }
    
    // Check if we can upgrade
    if (avgFPS > this.config.fpsUpgradeThreshold) {
      if (this.aboveThresholdStartTime === 0) {
        this.aboveThresholdStartTime = currentTime;
      }
      
      const timeAboveThreshold = currentTime - this.aboveThresholdStartTime;
      
      // Upgrade if above threshold for required time and not at maximum tier
      if (timeAboveThreshold >= this.config.upgradeDelayMs && this.currentTier < LODTier.HIGH) {
        this.startTransition(this.currentTier + 1, currentTime);
        this.aboveThresholdStartTime = 0;
        this.belowThresholdStartTime = 0;
      }
    } else {
      this.aboveThresholdStartTime = 0;
    }
  }
  
  /**
   * Start transition to new LOD tier
   */
  private startTransition(newTier: LODTier, currentTime: number): void {
    if (newTier === this.currentTier) return;
    
    this.targetTier = newTier;
    this.transitionStartTime = currentTime;
    this.lastTierChangeTime = currentTime;
    this.isTransitioning = true;
  }
  
  /**
   * Get current LOD tier
   */
  public getCurrentTier(): LODTier {
    return this.currentTier;
  }
  
  /**
   * Get target LOD tier (during transition)
   */
  public getTargetTier(): LODTier {
    return this.targetTier;
  }
  
  /**
   * Check if currently transitioning between tiers
   */
  public isInTransition(): boolean {
    return this.isTransitioning;
  }
  
  /**
   * Get transition progress (0-1)
   */
  public getTransitionProgress(currentTime: number): number {
    if (!this.isTransitioning) return 1;
    
    return calculateTransitionProgress(
      this.transitionStartTime,
      currentTime,
      this.config.transitionDurationMs
    );
  }
  
  /**
   * Manually set LOD tier (for user override)
   */
  public setTier(tier: LODTier, currentTime: number): void {
    if (tier === this.currentTier) return;
    
    this.startTransition(tier, currentTime);
  }
  
  /**
   * Reset to initial state
   */
  public reset(): void {
    this.fpsHistory = [];
    this.currentTier = LODTier.HIGH;
    this.targetTier = LODTier.HIGH;
    this.transitionStartTime = 0;
    this.lastTierChangeTime = 0;
    this.belowThresholdStartTime = 0;
    this.aboveThresholdStartTime = 0;
    this.isTransitioning = false;
  }
  
  /**
   * Get rendering parameters based on current tier
   */
  public getRenderingParams(currentTime: number): {
    tier: LODTier;
    showLabels: boolean;
    showLinks: boolean;
    maxNodes: number | null;
    nodeQuality: 'high' | 'medium' | 'low';
    linkOpacityMultiplier: number;
    transitionProgress: number;
  } {
    const tier = this.currentTier;
    const progress = this.getTransitionProgress(currentTime);
    
    // During transition, blend between tiers
    const effectiveTier = this.isTransitioning
      ? this.currentTier + (this.targetTier - this.currentTier) * progress
      : tier;
    
    switch (tier) {
      case LODTier.EMERGENCY:
        return {
          tier,
          showLabels: false,
          showLinks: false,
          maxNodes: 10000,
          nodeQuality: 'low',
          linkOpacityMultiplier: 0,
          transitionProgress: progress,
        };
      
      case LODTier.LOW:
        return {
          tier,
          showLabels: false,
          showLinks: false,
          maxNodes: null,
          nodeQuality: 'low',
          linkOpacityMultiplier: 0,
          transitionProgress: progress,
        };
      
      case LODTier.MEDIUM:
        return {
          tier,
          showLabels: false,
          showLinks: true,
          maxNodes: null,
          nodeQuality: 'medium',
          linkOpacityMultiplier: 0.5,
          transitionProgress: progress,
        };
      
      case LODTier.HIGH:
      default:
        return {
          tier,
          showLabels: true,
          showLinks: true,
          maxNodes: null,
          nodeQuality: 'high',
          linkOpacityMultiplier: 1.0,
          transitionProgress: progress,
        };
    }
  }
}

