import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "../types/graph";
import type { CommunityResult } from "../utils/communityDetection";
import { detectCommunities } from "../utils/communityDetection";

type Props = {
  communityResult?: CommunityResult | null;
  onBack?: () => void;
  onFocusNode?: (id: string) => void;
};

type D3Node = {
  id: string;
  name: string;
  type: "community" | "node";
  size: number; // visual radius
  color: string;
  originalId?: string; // when type === 'node'
};

type D3Link = { source: string; target: string; weight: number };

export default function CommunityMap({
  communityResult,
  onBack,
  onFocusNode,
}: Props) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [comm, setComm] = useState<CommunityResult | null>(
    communityResult ?? null
  );
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // React to prop changes
  useEffect(() => {
    if (communityResult) setComm(communityResult);
  }, [communityResult]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = (import.meta.env?.VITE_API_URL || "/api").replace(/\/$/, "");
      const url = `${base}/graph?max_nodes=50000&max_links=100000`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as GraphData;
      setGraph(data);
      if (!communityResult) {
        const res = detectCommunities(data);
        setComm(res);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [communityResult]);

  useEffect(() => {
    void load();
  }, [load]);

  // Build aggregated dataset for D3 depending on expansion state
  const aggregated = useMemo(() => {
    if (!graph || !comm) return null;
    const nodes: D3Node[] = [];
    const links: D3Link[] = [];

    if (expanded === null) {
      // Community-level supernodes
      for (const c of comm.communities) {
        nodes.push({
          id: `community_${c.id}`,
          name: c.label || `Community ${c.id}`,
          type: "community",
          size: Math.max(4, Math.sqrt(c.size) * 2),
          color: c.color,
        });
      }
      // Aggregate inter-community weights
      const w = new Map<string, number>();
      for (const l of graph.links) {
        const a = comm.nodeCommunities.get(l.source);
        const b = comm.nodeCommunities.get(l.target);
        if (a === undefined || b === undefined || a === b) continue;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        w.set(key, (w.get(key) || 0) + 1);
      }
      for (const [key, weight] of w) {
        const [aStr, bStr] = key.split("-");
        const a = Number(aStr);
        const b = Number(bStr);
        links.push({
          source: `community_${a}`,
          target: `community_${b}`,
          weight,
        });
      }
    } else {
      // One community expanded: include its member nodes + other supernodes
      const expandedComm = comm.communities.find((c) => c.id === expanded);
      if (!expandedComm) return null;
      const memberSet = new Set(expandedComm.nodes);

      // Add member nodes
      for (const n of graph.nodes) {
        if (memberSet.has(n.id)) {
          nodes.push({
            id: n.id,
            name: n.name || n.id,
            type: "node",
            size: 4,
            color: expandedComm.color,
            originalId: n.id,
          });
        }
      }
      // Other communities remain as supernodes
      for (const c of comm.communities) {
        if (c.id === expanded) continue;
        nodes.push({
          id: `community_${c.id}`,
          name: c.label || `Community ${c.id}`,
          type: "community",
          size: Math.max(4, Math.sqrt(c.size) * 2),
          color: c.color,
        });
      }

      // Intra-community edges only (for clarity)
      for (const l of graph.links) {
        const inA = memberSet.has(l.source);
        const inB = memberSet.has(l.target);
        if (inA && inB)
          links.push({ source: l.source, target: l.target, weight: 1 });
      }
    }

    return { nodes, links };
  }, [graph, comm, expanded]);

  // D3 render
  useEffect(() => {
    if (!aggregated || !svgRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3
      .select<SVGSVGElement, unknown>(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    svg.selectAll("*").remove();
    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    type SimNode = D3Node & d3.SimulationNodeDatum;
    type SimLink = d3.SimulationLinkDatum<SimNode> & { weight: number };

    const nodes: SimNode[] = aggregated.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = aggregated.links.map((l) => ({ ...l }));

    const sim = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => 40 + Math.min(200, 200 / Math.sqrt(d.weight || 1)))
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<SimNode>((d) => (d.size || 4) + 4)
      )
      .velocityDecay(0.88);

    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#888")
      .attr("stroke-opacity", 0.35)
      .attr(
        "stroke-width",
        (d) => 0.6 + Math.min(6, Math.log2((d.weight || 1) + 1))
      );

    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", (d) => d.size)
      .attr("fill", (d) => d.color)
      .attr("stroke", "#111")
      .attr("stroke-width", 1)
      .on("click", (_e, d) => {
        if (d.type === "community") {
          const id = Number(d.id.split("_")[1]);
          setExpanded((prev) => (prev === id ? null : id));
        } else if (d.type === "node") {
          onFocusNode?.(d.name);
        }
      });

    node.append("title").text((d) => d.name);

    const label = g
      .append("g")
      .attr("class", "labels")
      .selectAll<SVGTextElement, SimNode>("text")
      .data(nodes)
      .enter()
      .append("text")
      .text((d) => (d.type === "community" ? d.name : ""))
      .attr("font-size", (d) =>
        d.type === "community" ? 10 + Math.min(12, Math.sqrt(d.size) * 1.5) : 0
      )
      .attr("fill", "#fff")
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none")
      .style("user-select", "none");

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (typeof d.source === "object" ? d.source.x ?? 0 : 0))
        .attr("y1", (d) => (typeof d.source === "object" ? d.source.y ?? 0 : 0))
        .attr("x2", (d) => (typeof d.target === "object" ? d.target.x ?? 0 : 0))
        .attr("y2", (d) =>
          typeof d.target === "object" ? d.target.y ?? 0 : 0
        );
      node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
      label
        .attr("x", (d) => d.x ?? 0)
        .attr("y", (d) => (d.y ?? 0) - (d.size || 4) - 6);
    });

    sim.alpha(0.9).restart();
    return () => {
      sim.on('tick', null);
      sim.stop();
    };
  }, [aggregated, onFocusNode]);

  return (
    <div ref={containerRef} className="w-full h-screen relative bg-black">
      <div className="absolute top-2 left-2 z-10 bg-black/50 text-white rounded px-3 py-2 text-sm flex items-center gap-3">
        <button
          className="border border-white/30 rounded px-2 py-1 hover:bg-white/10"
          onClick={load}
        >
          Reload
        </button>
        <button
          className="border border-white/30 rounded px-2 py-1 hover:bg-white/10"
          onClick={() => setExpanded(null)}
        >
          Collapse all
        </button>
        <span className="opacity-80">
          {expanded === null
            ? "Community map"
            : `Expanded: Community ${expanded}`}
        </span>
      </div>
      <div className="absolute top-2 right-2 z-10 bg-black/50 text-white rounded px-3 py-2 text-sm flex items-center gap-3">
        <button
          className="px-2 py-1 rounded border bg-blue-600 border-blue-400 hover:bg-blue-700"
          onClick={onBack}
        >
          Back
        </button>
      </div>
      {loading && (
        <div className="absolute top-2 left-2 z-20 bg-black/50 text-white rounded px-3 py-2 text-sm">
          Loading…
        </div>
      )}
      {error && (
        <div className="absolute top-2 left-2 z-20 bg-red-900/70 text-red-100 rounded px-3 py-2 text-sm">
          Error: {error}
        </div>
      )}
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
