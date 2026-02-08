import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingGraphLoader, loadGraphProgressive } from './StreamingGraphLoader';
import type { GraphData } from '../types/graph';

describe('StreamingGraphLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('JSON fallback mode', () => {
    it('loads JSON data progressively in batches', async () => {
      const mockData: GraphData = {
        nodes: Array.from({ length: 15000 }, (_, i) => ({
          id: `node_${i}`,
          name: `Node ${i}`,
          val: Math.random() * 100,
          type: 'subreddit',
        })),
        links: Array.from({ length: 20000 }, (_, i) => ({
          source: `node_${i % 15000}`,
          target: `node_${(i + 1) % 15000}`,
        })),
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve(mockData),
        } as Response)
      );

      const progressUpdates: number[] = [];
      const onProgress = vi.fn((progress) => {
        progressUpdates.push(progress.nodesLoaded);
      });
      const onComplete = vi.fn();

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        batchSize: 5000,
        onProgress,
        onComplete,
      });

      const result = await loader.load();

      expect(result.nodes.length).toBe(15000);
      expect(result.links.length).toBeGreaterThan(0);
      expect(onProgress).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(result);
      
      // Should have had multiple progress updates
      expect(progressUpdates.length).toBeGreaterThan(1);
      expect(progressUpdates[0]).toBeLessThanOrEqual(5000);
    }, 20000); // Increase timeout to 20s for large dataset

    it('sorts nodes by importance (val and degree)', async () => {
      const mockData: GraphData = {
        nodes: [
          { id: 'node_1', name: 'Low Val', val: 1, type: 'user' },
          { id: 'node_2', name: 'High Val', val: 100, type: 'subreddit' },
          { id: 'node_3', name: 'Medium Val', val: 50, type: 'user' },
        ],
        links: [
          { source: 'node_1', target: 'node_2' },
          { source: 'node_1', target: 'node_3' },
        ],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve(mockData),
        } as Response)
      );

      const progressUpdates: string[] = [];
      const onProgress = vi.fn((progress) => {
        if (progress.batch.nodes.length > 0) {
          progressUpdates.push(progress.batch.nodes[0].id);
        }
      });

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        batchSize: 1,
        onProgress,
      });

      await loader.load();

      // First node should be the highest value one
      expect(progressUpdates[0]).toBe('node_2');
    });

    it('emits progress with correct percentages', async () => {
      const mockData: GraphData = {
        nodes: Array.from({ length: 10000 }, (_, i) => ({
          id: `node_${i}`,
          name: `Node ${i}`,
          type: 'subreddit',
        })),
        links: [],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve(mockData),
        } as Response)
      );

      const percentages: number[] = [];
      const onProgress = vi.fn((progress) => {
        percentages.push(progress.percentComplete);
      });

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        batchSize: 5000,
        onProgress,
      });

      await loader.load();

      // Should have progress updates
      expect(percentages.length).toBeGreaterThan(0);
      // Percentages should increase
      for (let i = 1; i < percentages.length; i++) {
        expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i - 1]);
      }
    });

    it('handles empty data', async () => {
      const mockData: GraphData = {
        nodes: [],
        links: [],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve(mockData),
        } as Response)
      );

      const onComplete = vi.fn();

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        onComplete,
      });

      const result = await loader.load();

      expect(result.nodes.length).toBe(0);
      expect(result.links.length).toBe(0);
      expect(onComplete).toHaveBeenCalled();
    });

    it('includes links progressively as nodes become available', async () => {
      const mockData: GraphData = {
        nodes: [
          { id: 'node_1', name: 'Node 1', val: 100, type: 'subreddit' },
          { id: 'node_2', name: 'Node 2', val: 90, type: 'user' },
          { id: 'node_3', name: 'Node 3', val: 80, type: 'user' },
        ],
        links: [
          { source: 'node_1', target: 'node_2' },
          { source: 'node_2', target: 'node_3' },
          { source: 'node_1', target: 'node_3' },
        ],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve(mockData),
        } as Response)
      );

      const linkCountsPerBatch: number[] = [];
      const onProgress = vi.fn((progress) => {
        linkCountsPerBatch.push(progress.linksLoaded);
      });

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        batchSize: 1,
        onProgress,
      });

      await loader.load();

      // Link count should increase as more nodes become available
      // First batch: 1 node, 0 links
      // Second batch: 2 nodes, 1 link (node_1 -> node_2)
      // Third batch: 3 nodes, 3 links (all connections available)
      expect(linkCountsPerBatch[0]).toBeLessThanOrEqual(linkCountsPerBatch[linkCountsPerBatch.length - 1]);
      expect(linkCountsPerBatch[linkCountsPerBatch.length - 1]).toBe(3);
    });
  });

  describe('Error handling', () => {
    it('handles HTTP errors', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response)
      );

      const onError = vi.fn();

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        onError,
      });

      await expect(loader.load()).rejects.toThrow('HTTP 404');
      expect(onError).toHaveBeenCalled();
    });

    it('handles abort signal', async () => {
      let resolveFetch: (value: unknown) => void;
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve;
      });

      global.fetch = vi.fn(() => fetchPromise as Promise<Response>);

      const controller = new AbortController();
      const onError = vi.fn();

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        signal: controller.signal,
        onError,
      });

      const loadPromise = loader.load();

      // Abort before fetch completes
      controller.abort();

      // Resolve fetch after abort
      resolveFetch!({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ nodes: [], links: [] }),
      });

      await expect(loadPromise).rejects.toThrow();
    });

    it('handles fetch errors', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

      const onError = vi.fn();

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        onError,
      });

      await expect(loader.load()).rejects.toThrow('Network error');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('NDJSON streaming mode', () => {
    it('parses NDJSON format with metadata', async () => {
      const ndjsonLines = [
        JSON.stringify({ type: 'metadata', totalNodes: 3, totalLinks: 2 }),
        JSON.stringify({ type: 'node', data: { id: 'node_1', name: 'Node 1', type: 'subreddit' } }),
        JSON.stringify({ type: 'node', data: { id: 'node_2', name: 'Node 2', type: 'user' } }),
        JSON.stringify({ type: 'node', data: { id: 'node_3', name: 'Node 3', type: 'user' } }),
        JSON.stringify({ type: 'link', data: { source: 'node_1', target: 'node_2' } }),
        JSON.stringify({ type: 'link', data: { source: 'node_2', target: 'node_3' } }),
      ].join('\n');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonLines));
          controller.close();
        },
      });

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/x-ndjson' }),
          body: stream,
        } as Response)
      );

      const onProgress = vi.fn();
      const onComplete = vi.fn();

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        batchSize: 5000,
        onProgress,
        onComplete,
      });

      const result = await loader.load();

      expect(result.nodes.length).toBe(3);
      expect(result.links.length).toBe(2);
      expect(onComplete).toHaveBeenCalledWith(result);
    });

    it('handles NDJSON without explicit type field', async () => {
      const ndjsonLines = [
        JSON.stringify({ id: 'node_1', name: 'Node 1', type: 'subreddit' }),
        JSON.stringify({ id: 'node_2', name: 'Node 2', type: 'user' }),
        JSON.stringify({ source: 'node_1', target: 'node_2' }),
      ].join('\n');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonLines));
          controller.close();
        },
      });

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/x-ndjson' }),
          body: stream,
        } as Response)
      );

      const loader = new StreamingGraphLoader({
        url: '/api/graph',
        batchSize: 5000,
      });

      const result = await loader.load();

      expect(result.nodes.length).toBe(2);
      expect(result.links.length).toBe(1);
    });
  });

  describe('loadGraphProgressive convenience function', () => {
    it('works as a shorthand', async () => {
      const mockData: GraphData = {
        nodes: [{ id: 'node_1', name: 'Node 1', type: 'subreddit' }],
        links: [],
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve(mockData),
        } as Response)
      );

      const result = await loadGraphProgressive({
        url: '/api/graph',
      });

      expect(result.nodes.length).toBe(1);
    });
  });
});
