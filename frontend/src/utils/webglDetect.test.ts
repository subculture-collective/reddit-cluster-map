import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectWebGLSupport, getWebGLStatus } from './webglDetect';

describe('webglDetect', () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalCreateElement = document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  describe('detectWebGLSupport', () => {
    it('returns true when WebGL2 is supported', () => {
      document.createElement = vi.fn(() => ({
        getContext: vi.fn((type) => (type === 'webgl2' ? {} : null)),
      })) as any;

      const result = detectWebGLSupport();
      expect(result).toBe(true);
    });

    it('returns true when WebGL is supported', () => {
      document.createElement = vi.fn(() => ({
        getContext: vi.fn((type) => (type === 'webgl' ? {} : null)),
      })) as any;

      const result = detectWebGLSupport();
      expect(result).toBe(true);
    });

    it('returns false when neither WebGL2 nor WebGL is supported', () => {
      document.createElement = vi.fn(() => ({
        getContext: vi.fn(() => null),
      })) as any;

      const result = detectWebGLSupport();
      expect(result).toBe(false);
    });

    it('returns false when getContext throws error', () => {
      document.createElement = vi.fn(() => ({
        getContext: vi.fn(() => {
          throw new Error('WebGL not supported');
        }),
      })) as any;

      const result = detectWebGLSupport();
      expect(result).toBe(false);
    });
  });

  describe('getWebGLStatus', () => {
    it('returns supported status when WebGL is available', () => {
      document.createElement = vi.fn(() => ({
        getContext: vi.fn((type) => (type === 'webgl' ? {} : null)),
      })) as any;

      const status = getWebGLStatus();
      expect(status.supported).toBe(true);
      expect(status.message).toBe('WebGL is supported');
    });

    it('returns not supported status when WebGL is unavailable', () => {
      document.createElement = vi.fn(() => ({
        getContext: vi.fn(() => null),
      })) as any;

      const status = getWebGLStatus();
      expect(status.supported).toBe(false);
      expect(status.message).toContain('WebGL is not supported');
    });

    it('message includes browser suggestions when not supported', () => {
      document.createElement = vi.fn(() => ({
        getContext: vi.fn(() => null),
      })) as any;

      const status = getWebGLStatus();
      expect(status.message).toContain('Chrome');
      expect(status.message).toContain('Firefox');
    });
  });
});
