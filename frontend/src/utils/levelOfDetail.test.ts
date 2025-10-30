import { describe, it, expect } from 'vitest';
import {
  calculateLinkOpacity,
  shouldShowLabels,
  shouldShowLink,
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
});
