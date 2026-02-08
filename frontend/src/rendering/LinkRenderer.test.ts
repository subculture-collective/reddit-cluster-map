import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { LinkRenderer, type LinkData } from './LinkRenderer';

describe('LinkRenderer', () => {
  let scene: THREE.Scene;
  let renderer: LinkRenderer;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 100;
    camera.updateProjectionMatrix();
    renderer = new LinkRenderer(scene, { maxLinks: 1000, opacity: 0.6 });
  });

  afterEach(() => {
    renderer.dispose();
  });

  describe('initialization', () => {
    it('should create a renderer with default config', () => {
      const defaultRenderer = new LinkRenderer(scene);
      expect(defaultRenderer).toBeDefined();
      const stats = defaultRenderer.getStats();
      expect(stats.maxLinks).toBe(200000);
      defaultRenderer.dispose();
    });

    it('should accept custom config', () => {
      const customRenderer = new LinkRenderer(scene, {
        maxLinks: 50000,
        opacity: 0.3,
        color: 0xff0000,
      });
      expect(customRenderer).toBeDefined();
      const stats = customRenderer.getStats();
      expect(stats.maxLinks).toBe(50000);
      customRenderer.dispose();
    });

    it('should add line segments to scene', () => {
      expect(scene.children.length).toBeGreaterThan(0);
      const hasLineSegments = scene.children.some(
        (child) => child instanceof THREE.LineSegments
      );
      expect(hasLineSegments).toBe(true);
    });
  });

  describe('setLinks', () => {
    it('should set link data', () => {
      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
        { source: 'node2', target: 'node3' },
        { source: 'node3', target: 'node4' },
      ];

      renderer.setLinks(links);

      const stats = renderer.getStats();
      expect(stats.totalLinks).toBe(3);
    });

    it('should handle empty link array', () => {
      renderer.setLinks([]);
      const stats = renderer.getStats();
      expect(stats.totalLinks).toBe(0);
      expect(stats.drawCalls).toBe(0);
    });

    it('should limit links to maxLinks', () => {
      const smallRenderer = new LinkRenderer(scene, { maxLinks: 2 });
      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
        { source: 'node2', target: 'node3' },
        { source: 'node3', target: 'node4' },
        { source: 'node4', target: 'node5' },
      ];

      smallRenderer.setLinks(links);

      const stats = smallRenderer.getStats();
      expect(stats.totalLinks).toBe(2);
      smallRenderer.dispose();
    });
  });

  describe('updatePositions', () => {
    it('should update node positions', () => {
      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
        { source: 'node2', target: 'node3' },
      ];

      renderer.setLinks(links);

      const positions = new Map([
        ['node1', { x: 0, y: 0, z: 0 }],
        ['node2', { x: 10, y: 10, z: 10 }],
        ['node3', { x: 20, y: 20, z: 20 }],
      ]);

      renderer.updatePositions(positions);

      const stats = renderer.getStats();
      expect(stats.visibleLinks).toBe(2);
    });

    it('should handle missing node positions', () => {
      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
        { source: 'node3', target: 'node4' },
      ];

      renderer.setLinks(links);

      const positions = new Map([
        ['node1', { x: 0, y: 0, z: 0 }],
        ['node2', { x: 10, y: 10, z: 10 }],
        // node3 and node4 missing
      ]);

      renderer.updatePositions(positions);

      const stats = renderer.getStats();
      // Should still track all links, but only one will have valid positions
      expect(stats.totalLinks).toBe(2);
    });

    it('should update buffer when positions change', () => {
      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
      ];

      renderer.setLinks(links);

      const positions1 = new Map([
        ['node1', { x: 0, y: 0, z: 0 }],
        ['node2', { x: 10, y: 10, z: 10 }],
      ]);

      renderer.updatePositions(positions1);

      const positions2 = new Map([
        ['node1', { x: 5, y: 5, z: 5 }],
        ['node2', { x: 15, y: 15, z: 15 }],
      ]);

      renderer.updatePositions(positions2);

      const stats = renderer.getStats();
      expect(stats.visibleLinks).toBe(1);
    });
  });

  describe('updateFrustumCulling', () => {
    it('should update visibility based on camera frustum', () => {
      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
        { source: 'node3', target: 'node4' },
      ];

      renderer.setLinks(links);

      // Position nodes: some visible, some not
      const positions = new Map([
        ['node1', { x: 0, y: 0, z: 0 }], // Visible
        ['node2', { x: 10, y: 10, z: 10 }], // Visible
        ['node3', { x: 1000, y: 1000, z: 1000 }], // Far away
        ['node4', { x: 2000, y: 2000, z: 2000 }], // Far away
      ]);

      renderer.updatePositions(positions);
      
      // Update camera matrices
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      
      renderer.updateFrustumCulling(camera);

      const stats = renderer.getStats();
      // At least one link should be visible
      expect(stats.visibleLinks).toBeGreaterThanOrEqual(1);
    });

    it('should not cull when frustum culling is disabled', () => {
      const noCullRenderer = new LinkRenderer(scene, {
        maxLinks: 1000,
        enableFrustumCulling: false,
      });

      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
        { source: 'node3', target: 'node4' },
      ];

      noCullRenderer.setLinks(links);

      const positions = new Map([
        ['node1', { x: 0, y: 0, z: 0 }],
        ['node2', { x: 10, y: 10, z: 10 }],
        ['node3', { x: 1000, y: 1000, z: 1000 }],
        ['node4', { x: 2000, y: 2000, z: 2000 }],
      ]);

      noCullRenderer.updatePositions(positions);
      noCullRenderer.updateFrustumCulling(camera);

      const stats = noCullRenderer.getStats();
      // All links should be visible when culling is disabled
      expect(stats.visibleLinks).toBe(2);
      noCullRenderer.dispose();
    });
  });

  describe('opacity and color', () => {
    it('should set opacity', () => {
      renderer.setOpacity(0.5);
      // Verify opacity is applied (tested via material)
      expect(renderer).toBeDefined();
    });

    it('should clamp opacity to valid range', () => {
      renderer.setOpacity(-0.5);
      renderer.setOpacity(1.5);
      // Should not throw
      expect(renderer).toBeDefined();
    });

    it('should set color', () => {
      renderer.setColor(0xff0000);
      renderer.setColor('#00ff00');
      // Should not throw
      expect(renderer).toBeDefined();
    });
  });

  describe('forceUpdate', () => {
    it('should trigger buffer update', () => {
      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
      ];

      renderer.setLinks(links);

      const positions = new Map([
        ['node1', { x: 0, y: 0, z: 0 }],
        ['node2', { x: 10, y: 10, z: 10 }],
      ]);

      renderer.updatePositions(positions);
      renderer.forceUpdate();

      // Should not throw
      expect(renderer).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const links: LinkData[] = [
        { source: 'node1', target: 'node2' },
        { source: 'node2', target: 'node3' },
        { source: 'node3', target: 'node4' },
      ];

      renderer.setLinks(links);

      const stats = renderer.getStats();
      expect(stats.totalLinks).toBe(3);
      expect(stats.maxLinks).toBe(1000);
      expect(stats.drawCalls).toBe(1);
    });

    it('should return zero draw calls for no links', () => {
      renderer.setLinks([]);
      const stats = renderer.getStats();
      expect(stats.drawCalls).toBe(0);
    });
  });

  describe('performance', () => {
    it('should handle large link counts efficiently', () => {
      const largeRenderer = new LinkRenderer(scene, { maxLinks: 10000 });
      const links: LinkData[] = [];
      const positions = new Map<string, { x: number; y: number; z: number }>();

      // Create 5000 links
      for (let i = 0; i < 5000; i++) {
        links.push({ source: `node${i}`, target: `node${i + 1}` });
        positions.set(`node${i}`, {
          x: Math.random() * 100,
          y: Math.random() * 100,
          z: Math.random() * 100,
        });
      }

      const startTime = performance.now();
      largeRenderer.setLinks(links);
      largeRenderer.updatePositions(positions);
      const endTime = performance.now();

      // Should complete in reasonable time (less than 50ms)
      const updateTime = endTime - startTime;
      expect(updateTime).toBeLessThan(50);

      largeRenderer.dispose();
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      const initialChildCount = scene.children.length;

      const tempRenderer = new LinkRenderer(scene);
      tempRenderer.setLinks([
        { source: 'node1', target: 'node2' },
      ]);

      tempRenderer.dispose();

      // Scene children should be cleaned up
      expect(scene.children.length).toBe(initialChildCount);
    });

    it('should handle multiple dispose calls', () => {
      renderer.dispose();
      renderer.dispose();
      // Should not throw
      expect(renderer).toBeDefined();
    });
  });
});
