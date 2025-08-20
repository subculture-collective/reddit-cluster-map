import type { GraphData, GraphNode } from "../types/graph";
import { useEffect, useMemo, useRef, useState } from "react";

import ForceGraph3D from "react-force-graph-3d";

type Filters = {
  subreddit: boolean;
  user: boolean;
  post: boolean;
  comment: boolean;
};

interface Props {
  filters: Filters;
  linkOpacity: number;
  nodeRelSize: number;
  focusNodeId?: string;
  onNodeSelect?: (id?: string) => void;
  showLabels?: boolean;
}

export default function Graph3D({
  filters,
  linkOpacity,
  nodeRelSize,
  focusNodeId,
  onNodeSelect,
  showLabels,
}: Props) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  const load = async (signal?: AbortSignal) => {
    try {
      // Build API url. VITE_API_URL can be '' (same-origin proxy) or '/api' (nginx proxy),
      // or a full URL in other deployments. We strip trailing slash and append '/graph'.
      const base = (import.meta.env?.VITE_API_URL || "/api").replace(/\/$/, "");
      const url = `${base}/graph`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as GraphData;
      setGraphData(data);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.name === "AbortError") return;
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  const getColor = useMemo(
    () => (type?: string) => {
      switch (type) {
        case "subreddit":
          return "#4ade80";
        case "user":
          return "#60a5fa";
        case "post":
          return "#f59e0b";
        case "comment":
          return "#f43f5e";
        default:
          return "#a78bfa";
      }
    },
    []
  );

  // Focus on node by id or name
  useEffect(() => {
    if (!focusNodeId || !fgRef.current || !graphData) return;
    const match = graphData.nodes.find(
      (n) =>
        n.id === focusNodeId ||
        n.name?.toLowerCase() === focusNodeId.toLowerCase()
    );
    if (!match) return;
    const distance = 200;
    const distRatio = 1 + distance / (match.val || 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { x = 0, y = 0, z = 0 } = match as any;
    fgRef.current.cameraPosition(
      { x: x * distRatio, y: y * distRatio, z: z * distRatio },
      { x, y, z },
      1500
    );
  }, [focusNodeId, graphData]);

  if (error) return <div className="p-4 text-red-400">Error: {error}</div>;
  if (!graphData) return <div className="p-4">Loading graph…</div>;

  // Filter nodes by selected types
  const allowed = new Set(
    Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k]) => k)
  );
  const nodes = graphData.nodes.filter((n) => !n.type || allowed.has(n.type));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links = graphData.links.filter(
    (l) => nodeIds.has(l.source) && nodeIds.has(l.target)
  );
  const filtered: GraphData = { nodes, links };

  return (
    <div className="w-full h-screen relative">
      <div className="absolute top-2 left-2 z-10 bg-black/50 text-white rounded px-3 py-2 text-sm flex items-center gap-3">
        <span>Nodes: {graphData.nodes.length}</span>
        <span>Links: {graphData.links.length}</span>
        <button
          className="ml-2 border border-white/30 rounded px-2 py-1 hover:bg-white/10"
          onClick={() => load()}
        >
          Reload
        </button>
      </div>
      <ForceGraph3D
        ref={fgRef}
        graphData={filtered}
        nodeLabel={showLabels ? "name" : (undefined as unknown as string)}
        nodeColor={(node) => getColor((node as GraphNode).type)}
        nodeRelSize={nodeRelSize}
        linkWidth={1}
        linkColor={() => "#999"}
        linkOpacity={linkOpacity}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onNodeClick={(node: any) => onNodeSelect?.(node?.id)}
        backgroundColor="#000000"
        // Render labels conditionally (using the default tooltip works out of the box).
        // For persistent labels, we'd use three-spritetext; this is a toggle placeholder.
        enableNodeDrag={true}
      />
    </div>
  );
}
