import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateLinkOpacity,
  shouldShowLabels,
  shouldShowLink,
  calculateDistanceLODTier,
  calculateTransitionProgress,
  AdaptiveLODManager,
  LODTier,
  DEFAULT_LOD_CONFIG,
} from './levelOfDetail';

describe('levelOfDetail utils', () => {
  describe('calculateLinkOpacity', () => {
    it('returns max opacity when camera is close', () => {
      const result = calculateLinkOpacity(100, 0.5);
      expect(result).toBeLessThanOrEqual(DEFAULT_LOD_CONFIG.maxLinkOpacity);
    });

    it('returns base opacity when within close threshold', () => {
      const result = calculateLinkOpacity(300, 0.5);
      expect(result).toBeGreaterThan(0);
    });

    it('returns min opacity when camera is far', () => {
      const result = calculateLinkOpacity(2000, 0.5);
      expect(result).toBeGreaterThanOrEqual(DEFAULT_LOD_CONFIG.minLinkOpacity);
    });

    it('respects custom LOD config', () => {
      const customConfig = {
        ...DEFAULT_LOD_CONFIG,
        maxLinkOpacity: 1.0,
        minLinkOpacity: 0.05,
      };
      const result = calculateLinkOpacity(100, 0.5, customConfig);
      expect(result).toBeLessThanOrEqual(1.0);
    });
  });

  describe('shouldShowLabels', () => {
    it('returns true when camera is close', () => {
      expect(shouldShowLabels(500)).toBe(true);
    });

    it('returns false when camera is far', () => {
      expect(shouldShowLabels(1000)).toBe(false);
    });

    it('respects threshold from config', () => {
      const customConfig = {
        ...DEFAULT_LOD_CONFIG,
        labelVisibilityThreshold: 1000,
      };
      expect(shouldShowLabels(900, customConfig)).toBe(true);
      expect(shouldShowLabels(1100, customConfig)).toBe(false);
    });
  });

  describe('shouldShowLink', () => {
    it('always returns true for selected links', () => {
      expect(shouldShowLink(5000, true)).toBe(true);
    });

    it('returns true when camera is close', () => {
      expect(shouldShowLink(500, false)).toBe(true);
    });

    it('returns false when camera is far and not selected', () => {
      expect(shouldShowLink(2000, false)).toBe(false);
    });

    it('respects threshold from config', () => {
      const customConfig = {
        ...DEFAULT_LOD_CONFIG,
        linkVisibilityThreshold: 1500,
      };
      expect(shouldShowLink(1000, false, customConfig)).toBe(true);
      expect(shouldShowLink(2000, false, customConfig)).toBe(false);
    });
  });

  describe('calculateDistanceLODTier', () => {
    it('returns HIGH tier for close distance', () => {
      expect(calculateDistanceLODTier(400)).toBe(LODTier.HIGH);
    });

    it('returns MEDIUM tier for medium distance', () => {
      expect(calculateDistanceLODTier(750)).toBe(LODTier.MEDIUM);
    });

    it('returns LOW tier for far distance', () => {
      expect(calculateDistanceLODTier(1500)).toBe(LODTier.LOW);
    });

    it('returns EMERGENCY tier for very far distance', () => {
      expect(calculateDistanceLODTier(2500)).toBe(LODTier.EMERGENCY);
    });

    it('respects custom distance tiers', () => {
      const customConfig = {
        ...DEFAULT_LOD_CONFIG,
        distanceTiers: { close: 100, medium: 200, far: 300 },
      };
      expect(calculateDistanceLODTier(50, customConfig)).toBe(LODTier.HIGH);
      expect(calculateDistanceLODTier(150, customConfig)).toBe(LODTier.MEDIUM);
      expect(calculateDistanceLODTier(250, customConfig)).toBe(LODTier.LOW);
      expect(calculateDistanceLODTier(350, customConfig)).toBe(LODTier.EMERGENCY);
    });
  });

  describe('calculateTransitionProgress', () => {
    it('returns 0 at start time', () => {
      expect(calculateTransitionProgress(1000, 1000, 500)).toBe(0);
    });

    it('returns 0.5 at halfway point', () => {
      expect(calculateTransitionProgress(1000, 1250, 500)).toBe(0.5);
    });

    it('returns 1 at end time', () => {
      expect(calculateTransitionProgress(1000, 1500, 500)).toBe(1);
    });

    it('clamps to 1 when past end time', () => {
      expect(calculateTransitionProgress(1000, 2000, 500)).toBe(1);
    });

    it('clamps to 0 when before start time', () => {
      expect(calculateTransitionProgress(1000, 500, 500)).toBe(0);
    });
  });

  describe('AdaptiveLODManager', () => {
    let manager: AdaptiveLODManager;

    beforeEach(() => {
      manager = new AdaptiveLODManager();
    });

    describe('initialization', () => {
      it('starts at HIGH tier', () => {
        expect(manager.getCurrentTier()).toBe(LODTier.HIGH);
      });

      it('is not transitioning initially', () => {
        expect(manager.isInTransition()).toBe(false);
      });

      it('uses default config', () => {
        const config = manager.getConfig();
        expect(config.enableAdaptiveLOD).toBe(true);
        expect(config.fpsDowngradeThreshold).toBe(24);
        expect(config.fpsUpgradeThreshold).toBe(50);
      });
    });

    describe('FPS tracking', () => {
      it('records FPS values', () => {
        manager.recordFrame(60);
        manager.recordFrame(58);
        manager.recordFrame(62);
        
        const avgFPS = manager.getAverageFPS();
        expect(avgFPS).toBe(60);
      });

      it('maintains rolling window of 60 frames', () => {
        for (let i = 0; i < 100; i++) {
          manager.recordFrame(30);
        }
        
        const avgFPS = manager.getAverageFPS();
        expect(avgFPS).toBe(30);
      });

      it('returns 60 when no frames recorded', () => {
        expect(manager.getAverageFPS()).toBe(60);
      });
    });

    describe('tier downgrade', () => {
      it('downgrades after sustained low FPS', () => {
        // Record low FPS
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(20);
        }
        
        // Update at start time
        manager.update(1000);
        expect(manager.getCurrentTier()).toBe(LODTier.HIGH);
        
        // Update after delay to start transition
        manager.update(3500); // 2.5s later (> 2s threshold)
        expect(manager.isInTransition()).toBe(true);
        expect(manager.getTargetTier()).toBe(LODTier.MEDIUM);
        
        // Complete transition
        manager.update(4100); // After 500ms transition
        expect(manager.getCurrentTier()).toBe(LODTier.MEDIUM);
      });

      it('does not downgrade before delay threshold', () => {
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(20);
        }
        
        manager.update(1000);
        manager.update(2500); // Only 1.5s later (< 2s threshold)
        
        expect(manager.getCurrentTier()).toBe(LODTier.HIGH);
      });

      it('resets downgrade timer when FPS recovers', () => {
        // Low FPS
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(20);
        }
        
        manager.update(1000);
        manager.update(2500); // 1.5s of low FPS
        
        // FPS recovers
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(60);
        }
        
        manager.update(3500); // Would be past threshold, but FPS recovered
        expect(manager.getCurrentTier()).toBe(LODTier.HIGH);
      });

      it('can downgrade multiple tiers', () => {
        manager.setConfig({ downgradeDelayMs: 100 });
        
        // Downgrade to MEDIUM
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(20);
        }
        manager.update(1000);
        manager.update(1200);
        expect(manager.isInTransition()).toBe(true);
        expect(manager.getTargetTier()).toBe(LODTier.MEDIUM);
        
        // Wait for transition
        manager.update(1800);
        expect(manager.getCurrentTier()).toBe(LODTier.MEDIUM);
        
        // Downgrade to LOW
        manager.update(2000);
        manager.update(2200);
        expect(manager.getTargetTier()).toBe(LODTier.LOW);
        
        manager.update(2800);
        expect(manager.getCurrentTier()).toBe(LODTier.LOW);
      });

      it('stops at EMERGENCY tier', () => {
        manager.setConfig({ downgradeDelayMs: 100 });
        
        // Downgrade all the way
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(20);
        }
        
        manager.update(1000);
        manager.update(1200); // -> MEDIUM
        manager.update(1800); // Complete transition
        manager.update(2000);
        manager.update(2200); // -> LOW
        manager.update(2800); // Complete transition
        manager.update(3000);
        manager.update(3200); // -> EMERGENCY
        manager.update(3800); // Complete transition
        manager.update(4000);
        manager.update(4200); // Try to go lower (should stay at EMERGENCY)
        
        expect(manager.getCurrentTier()).toBe(LODTier.EMERGENCY);
      });
    });

    describe('tier upgrade', () => {
      beforeEach(() => {
        // Start at LOW tier
        manager.setTier(LODTier.LOW, 1000);
        manager.update(2000); // Complete transition
      });

      it('upgrades after sustained high FPS', () => {
        // Record high FPS
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(60);
        }
        
        manager.update(3000);
        expect(manager.getCurrentTier()).toBe(LODTier.LOW);
        
        // Update after delay to start transition
        manager.update(8500); // 5.5s later (> 5s threshold)
        expect(manager.isInTransition()).toBe(true);
        expect(manager.getTargetTier()).toBe(LODTier.MEDIUM);
        
        // Complete transition
        manager.update(9100);
        expect(manager.getCurrentTier()).toBe(LODTier.MEDIUM);
      });

      it('does not upgrade before delay threshold', () => {
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(60);
        }
        
        manager.update(3000);
        manager.update(7000); // Only 4s later (< 5s threshold)
        
        expect(manager.getCurrentTier()).toBe(LODTier.LOW);
      });

      it('stops at HIGH tier', () => {
        manager.setConfig({ upgradeDelayMs: 100 });
        
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(60);
        }
        
        manager.update(3000);
        manager.update(3200); // -> MEDIUM
        manager.update(3800); // Complete transition
        manager.update(4000);
        manager.update(4200); // -> HIGH
        manager.update(4800); // Complete transition
        manager.update(5000);
        manager.update(5200); // Try to go higher (should stay at HIGH)
        
        expect(manager.getCurrentTier()).toBe(LODTier.HIGH);
      });
    });

    describe('manual tier setting', () => {
      it('allows manual tier override', () => {
        manager.setTier(LODTier.MEDIUM, 1000);
        manager.update(2000); // Complete transition
        expect(manager.getCurrentTier()).toBe(LODTier.MEDIUM);
      });

      it('starts transition when setting tier', () => {
        manager.setTier(LODTier.LOW, 1000);
        expect(manager.isInTransition()).toBe(true);
        expect(manager.getTargetTier()).toBe(LODTier.LOW);
      });
    });

    describe('rendering parameters', () => {
      it('returns correct params for HIGH tier', () => {
        const params = manager.getRenderingParams(1000);
        expect(params.tier).toBe(LODTier.HIGH);
        expect(params.showLabels).toBe(true);
        expect(params.showLinks).toBe(true);
        expect(params.nodeQuality).toBe('high');
        expect(params.linkOpacityMultiplier).toBe(1.0);
      });

      it('returns correct params for MEDIUM tier', () => {
        manager.setTier(LODTier.MEDIUM, 1000);
        manager.update(2000); // Complete transition
        
        const params = manager.getRenderingParams(2000);
        expect(params.tier).toBe(LODTier.MEDIUM);
        expect(params.showLabels).toBe(false);
        expect(params.showLinks).toBe(true);
        expect(params.nodeQuality).toBe('medium');
        expect(params.linkOpacityMultiplier).toBe(0.5);
      });

      it('returns correct params for LOW tier', () => {
        manager.setTier(LODTier.LOW, 1000);
        manager.update(2000); // Complete transition
        
        const params = manager.getRenderingParams(2000);
        expect(params.tier).toBe(LODTier.LOW);
        expect(params.showLabels).toBe(false);
        expect(params.showLinks).toBe(false);
        expect(params.nodeQuality).toBe('low');
        expect(params.linkOpacityMultiplier).toBe(0);
      });

      it('returns correct params for EMERGENCY tier', () => {
        manager.setTier(LODTier.EMERGENCY, 1000);
        manager.update(2000); // Complete transition
        
        const params = manager.getRenderingParams(2000);
        expect(params.tier).toBe(LODTier.EMERGENCY);
        expect(params.showLabels).toBe(false);
        expect(params.showLinks).toBe(false);
        expect(params.maxNodes).toBe(10000);
        expect(params.nodeQuality).toBe('low');
        expect(params.linkOpacityMultiplier).toBe(0);
      });
    });

    describe('reset', () => {
      it('resets to initial state', () => {
        manager.setTier(LODTier.LOW, 1000);
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(30);
        }
        
        manager.reset();
        
        expect(manager.getCurrentTier()).toBe(LODTier.HIGH);
        expect(manager.getAverageFPS()).toBe(60);
        expect(manager.isInTransition()).toBe(false);
      });
    });

    describe('config updates', () => {
      it('allows partial config updates', () => {
        manager.setConfig({ fpsDowngradeThreshold: 30 });
        
        const config = manager.getConfig();
        expect(config.fpsDowngradeThreshold).toBe(30);
        expect(config.fpsUpgradeThreshold).toBe(50); // Unchanged
      });

      it('respects disabled adaptive LOD', () => {
        manager.setConfig({ enableAdaptiveLOD: false });
        
        // Record low FPS
        for (let i = 0; i < 60; i++) {
          manager.recordFrame(20);
        }
        
        manager.update(1000);
        manager.update(5000); // Well past threshold
        
        // Should not downgrade when disabled
        expect(manager.getCurrentTier()).toBe(LODTier.HIGH);
      });
    });
  });
});
