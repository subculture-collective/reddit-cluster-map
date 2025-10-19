/**
 * Level-of-detail (LOD) configuration for adaptive rendering.
 * Controls visibility and quality of graph elements based on view state.
 */

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
}

export const DEFAULT_LOD_CONFIG: LODConfig = {
  linkVisibilityThreshold: 1200,
  labelVisibilityThreshold: 800,
  maxLabels: 200,
  minLabelDegree: 2,
  minLinkOpacity: 0.1,
  maxLinkOpacity: 0.8,
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
