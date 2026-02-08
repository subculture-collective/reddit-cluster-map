import type { GraphData, GraphNode, GraphLink } from '../types/graph';

export interface LoadProgress {
  nodesLoaded: number;
  linksLoaded: number;
  totalNodes?: number;
  totalLinks?: number;
  percentComplete: number;
  batch: {
    nodes: GraphNode[];
    links: GraphLink[];
  };
}

export interface StreamingGraphLoaderOptions {
  url: string;
  batchSize?: number; // Default: 5000 nodes per batch
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
  onComplete?: (data: GraphData) => void;
  onError?: (error: Error) => void;
}

export class StreamingGraphLoader {
  private options: Required<Omit<StreamingGraphLoaderOptions, 'signal' | 'onProgress' | 'onComplete' | 'onError'>> & Pick<StreamingGraphLoaderOptions, 'signal' | 'onProgress' | 'onComplete' | 'onError'>;
  private aborted = false;

  constructor(options: StreamingGraphLoaderOptions) {
    this.options = {
      batchSize: 5000,
      ...options,
    };

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.aborted = true;
      });
    }
  }

  /**
   * Load graph data progressively.
   * First attempts NDJSON streaming, falls back to JSON chunking.
   */
  async load(): Promise<GraphData> {
    try {
      const response = await fetch(this.options.url, {
        signal: this.options.signal,
        headers: {
          'Accept': 'application/x-ndjson, application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      
      // Check if server supports NDJSON streaming
      if (contentType.includes('application/x-ndjson')) {
        return await this.loadNDJSON(response);
      } else {
        // Fallback to JSON with simulated progressive loading
        return await this.loadJSON(response);
      }
    } catch (error) {
      if (this.aborted || (error as { name?: string })?.name === 'AbortError') {
        throw new Error('Load aborted');
      }
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(err);
      throw err;
    }
  }

  /**
   * Load NDJSON streaming data (future backend support)
   */
  private async loadNDJSON(response: Response): Promise<GraphData> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const allNodes: GraphNode[] = [];
    const allLinks: GraphLink[] = [];
    let currentBatch: { nodes: GraphNode[]; links: GraphLink[] } = { nodes: [], links: [] };
    let totalNodes: number | undefined;
    let totalLinks: number | undefined;

    try {
      while (true) {
        if (this.aborted) {
          reader.cancel();
          throw new Error('Load aborted');
        }

        const { done, value } = await reader.read();
        
        if (done) {
          // Process any remaining data in buffer
          if (buffer.trim()) {
            try {
              const item = JSON.parse(buffer);
              
              // Handle node
              if (item.type === 'node' || (item.id !== undefined && item.source === undefined)) {
                const node = item.type === 'node' ? item.data : item;
                allNodes.push(node);
                currentBatch.nodes.push(node);
              }
              // Handle link
              else if (item.type === 'link' || (item.source !== undefined && item.target !== undefined)) {
                const link = item.type === 'link' ? item.data : item;
                allLinks.push(link);
                currentBatch.links.push(link);
              }
            } catch (parseError) {
              console.warn('Failed to parse final NDJSON line:', buffer, parseError);
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const item = JSON.parse(line);
            
            // Handle metadata line (first line typically contains totals)
            if (item.type === 'metadata') {
              totalNodes = item.totalNodes;
              totalLinks = item.totalLinks;
              continue;
            }

            // Handle node (has id field or explicit node type)
            if (item.type === 'node' || (item.id !== undefined && item.source === undefined)) {
              const node = item.type === 'node' ? item.data : item;
              allNodes.push(node);
              currentBatch.nodes.push(node);
            }
            // Handle link (has source and target, or explicit link type)
            else if (item.type === 'link' || (item.source !== undefined && item.target !== undefined)) {
              const link = item.type === 'link' ? item.data : item;
              allLinks.push(link);
              currentBatch.links.push(link);
            }

            // Emit batch when reaching batch size
            if (currentBatch.nodes.length >= this.options.batchSize) {
              this.emitProgress(allNodes, allLinks, currentBatch, totalNodes, totalLinks);
              currentBatch = { nodes: [], links: [] };
            }
          } catch (parseError) {
            console.warn('Failed to parse NDJSON line:', line, parseError);
          }
        }
      }

      // Emit final batch if any remaining
      if (currentBatch.nodes.length > 0 || currentBatch.links.length > 0) {
        this.emitProgress(allNodes, allLinks, currentBatch, totalNodes, totalLinks);
      }

      const result = { nodes: allNodes, links: allLinks };
      this.options.onComplete?.(result);
      return result;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Load standard JSON with simulated progressive loading
   */
  private async loadJSON(response: Response): Promise<GraphData> {
    const data = await response.json() as GraphData;
    
    if (this.aborted) {
      throw new Error('Load aborted');
    }

    const { nodes, links } = data;
    const totalNodes = nodes.length;
    const totalLinks = links.length;

    // Sort nodes by importance (val field, then degree)
    const degreeMap = new Map<string, number>();
    for (const link of links) {
      const source = typeof link.source === 'string' ? link.source : (link.source as { id?: string })?.id;
      const target = typeof link.target === 'string' ? link.target : (link.target as { id?: string })?.id;
      if (source) degreeMap.set(source, (degreeMap.get(source) || 0) + 1);
      if (target) degreeMap.set(target, (degreeMap.get(target) || 0) + 1);
    }

    const sortedNodes = [...nodes].sort((a, b) => {
      const aVal = a.val || 0;
      const bVal = b.val || 0;
      const aDegree = degreeMap.get(a.id) || 0;
      const bDegree = degreeMap.get(b.id) || 0;
      const aScore = Math.max(aVal, aDegree);
      const bScore = Math.max(bVal, bDegree);
      return bScore - aScore; // Descending order
    });

    // Process in batches with simulated async breaks
    const allNodes: GraphNode[] = [];
    const allLinks: GraphLink[] = [];
    const nodeIds = new Set<string>();

    for (let i = 0; i < sortedNodes.length; i += this.options.batchSize) {
      if (this.aborted) {
        throw new Error('Load aborted');
      }

      const batchNodes = sortedNodes.slice(i, i + this.options.batchSize);
      allNodes.push(...batchNodes);
      
      // Add node IDs to set for link filtering
      for (const node of batchNodes) {
        nodeIds.add(node.id);
      }

      // Include links where both source and target are in loaded nodes
      const batchLinks: GraphLink[] = [];
      for (const link of links) {
        const source = typeof link.source === 'string' ? link.source : (link.source as { id?: string })?.id || '';
        const target = typeof link.target === 'string' ? link.target : (link.target as { id?: string })?.id || '';
        
        // Only include link if both nodes are loaded AND link not already added
        if (nodeIds.has(source) && nodeIds.has(target)) {
          const linkId = `${source}-${target}`;
          const alreadyAdded = allLinks.some(l => {
            const lSource = typeof l.source === 'string' ? l.source : (l.source as { id?: string })?.id || '';
            const lTarget = typeof l.target === 'string' ? l.target : (l.target as { id?: string })?.id || '';
            return `${lSource}-${lTarget}` === linkId;
          });
          
          if (!alreadyAdded) {
            batchLinks.push(link);
            allLinks.push(link);
          }
        }
      }

      // Emit progress
      this.emitProgress(allNodes, allLinks, { nodes: batchNodes, links: batchLinks }, totalNodes, totalLinks);

      // Yield to event loop to keep UI responsive (skip for tests with small datasets)
      if (sortedNodes.length > 1000) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const result = { nodes: allNodes, links: allLinks };
    this.options.onComplete?.(result);
    return result;
  }

  private emitProgress(
    allNodes: GraphNode[],
    allLinks: GraphLink[],
    batch: { nodes: GraphNode[]; links: GraphLink[] },
    totalNodes?: number,
    totalLinks?: number
  ) {
    const percentComplete = totalNodes && totalNodes > 0
      ? Math.round((allNodes.length / totalNodes) * 100)
      : 0;

    const progress: LoadProgress = {
      nodesLoaded: allNodes.length,
      linksLoaded: allLinks.length,
      totalNodes,
      totalLinks,
      percentComplete,
      batch,
    };

    this.options.onProgress?.(progress);
  }
}

/**
 * Convenience function to load graph data progressively
 */
export async function loadGraphProgressive(
  options: StreamingGraphLoaderOptions
): Promise<GraphData> {
  const loader = new StreamingGraphLoader(options);
  return await loader.load();
}
