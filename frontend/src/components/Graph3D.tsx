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
  const [onlyLinked, setOnlyLinked] = useState(true);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  const load = async (signal?: AbortSignal) => {
    try {
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
    // Disable periodic polling to reduce distraction
    return () => controller.abort();
  }, []);

  // Removed per-type counters to keep UI minimal and avoid distraction

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

  // Filter nodes by selected types (always define for hooks)
  const allowed = new Set(
    Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k]) => k)
  );
  const allNodes = graphData?.nodes ?? [];
  const allLinks = graphData?.links ?? [];
  const filteredNodes = allNodes.filter((n) => !n.type || allowed.has(n.type));
  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  const links = allLinks.filter(
    (l) => nodeIds.has(l.source) && nodeIds.has(l.target)
  );

  const linkedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of links) {
      ids.add(l.source);
      ids.add(l.target);
    }
    return ids;
  }, [links]);
  const nodes = onlyLinked
    ? filteredNodes.filter((n) => linkedNodeIds.has(n.id))
    : filteredNodes;
  const filtered: GraphData = { nodes, links };

  if (error) return <div className="p-4 text-red-400">Error: {error}</div>;
  if (!graphData) return <div className="p-4">Loading graph…</div>;

  return (
    <div className="w-full h-screen relative">
      {/* Minimal HUD: hide running counters and auto-poll UI; keep manual Reload */}
      <div className="absolute top-2 left-2 z-10 bg-black/50 text-white rounded px-3 py-2 text-sm flex items-center gap-3">
        <button
          className="border border-white/30 rounded px-2 py-1 hover:bg-white/10"
          onClick={() => load()}
        >
          Reload
        </button>
        <label className="ml-2 flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyLinked}
            onChange={() => setOnlyLinked((v) => !v)}
            className="accent-blue-400"
          />
          <span className="opacity-80">Only show linked nodes</span>
        </label>
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
        onNodeClick={(node: any) => onNodeSelect?.(node?.name)}
        backgroundColor="#000000"
        enableNodeDrag={true}
      />
    </div>
  );
}
