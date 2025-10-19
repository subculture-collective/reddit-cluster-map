import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, GraphNode, GraphLink } from "../types/graph";
import type { TypeFilters } from "../types/ui";
import { FrameThrottler } from "../utils/frameThrottle";

type SubSizeMode =
  | "subscribers"
  | "activeUsers"
  | "contentActivity"
  | "interSubLinks";

type Graph2DProps = {
  filters: TypeFilters;
  linkOpacity: number;
  nodeRelSize: number;
  physics: {
    chargeStrength: number;
    linkDistance: number;
    velocityDecay: number;
    cooldownTicks: number;
    collisionRadius: number;
  };
  subredditSize: SubSizeMode;
  focusNodeId?: string;
  showLabels?: boolean;
  selectedId?: string;
  onNodeSelect?: (id?: string) => void;
  communityResult?: {
    nodeCommunities: Map<string, number>;
    communities: Array<{ id: number; color: string }>;
  } | null;
  usePrecomputedLayout?: boolean;
};

type D3Node = GraphNode & {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type D3Link = {
  source: string | D3Node;
  target: string | D3Node;
};

// ---- Helper functions (same as 3D) ----

const buildDegreeMap = (links: GraphLink[]) => {
  const m = new Map<string, number>();
  for (const l of links) {
    m.set(l.source, (m.get(l.source) || 0) + 1);
    m.set(l.target, (m.get(l.target) || 0) + 1);
  }
  return m;
};

const metricSubscribers = (nodes: GraphNode[]) => {
  const m = new Map<string, number>();
  for (const n of nodes)
    if (n.type === "subreddit")
      m.set(n.id, typeof n.val === "number" ? n.val : 0);
  return m;
};

const metricActiveUsers = (links: GraphLink[]) => {
  const subToUsers = new Map<string, Set<string>>();
  const add = (subId: string, userId: string) => {
    let set = subToUsers.get(subId);
    if (!set) {
      set = new Set<string>();
      subToUsers.set(subId, set);
    }
    set.add(userId);
  };
  for (const l of links) {
    const s = String(l.source);
    const t = String(l.target);
    if (s.startsWith("user_") && t.startsWith("subreddit_")) add(t, s);
    else if (t.startsWith("user_") && s.startsWith("subreddit_")) add(s, t);
  }
  const m = new Map<string, number>();
  for (const [k, set] of subToUsers) m.set(k, set.size);
  return m;
};

const metricInterSubLinks = (links: GraphLink[]) => {
  const m = new Map<string, number>();
  for (const l of links) {
    const s = String(l.source);
    const t = String(l.target);
    if (s.startsWith("subreddit_") && t.startsWith("subreddit_")) {
      m.set(s, (m.get(s) || 0) + 1);
      m.set(t, (m.get(t) || 0) + 1);
    }
  }
  return m;
};

const metricContentActivity = (links: GraphLink[]) => {
  const postBelongs = new Map<string, string>();
  const m = new Map<string, number>();
  for (const l of links) {
    const s = String(l.source);
    const t = String(l.target);
    if (s.startsWith("subreddit_") && t.startsWith("post_")) {
      postBelongs.set(t, s);
      m.set(s, (m.get(s) || 0) + 1);
    }
  }
  for (const l of links) {
    const s = String(l.source);
    const t = String(l.target);
    if (!(s.startsWith("post_") && t.startsWith("comment_"))) continue;
    const sub = postBelongs.get(s);
    if (sub) m.set(sub, (m.get(sub) || 0) + 1);
  }
  return m;
};

const computeSubredditMetric = (
  mode: SubSizeMode,
  links: GraphLink[],
  nodes: GraphNode[]
) => {
  switch (mode) {
    case "interSubLinks":
      return metricInterSubLinks(links);
    case "activeUsers":
      return metricActiveUsers(links);
    case "contentActivity":
      return metricContentActivity(links);
    case "subscribers":
    default:
      return metricSubscribers(nodes);
  }
};

const getNodeColor = (
  node: D3Node,
  communityResult?: {
    nodeCommunities: Map<string, number>;
    communities: Array<{ id: number; color: string }>;
  } | null
) => {
  // Use community color if available
  if (communityResult) {
    const commId = communityResult.nodeCommunities.get(node.id);
    if (commId !== undefined) {
      const community = communityResult.communities.find(
        (c) => c.id === commId
      );
      if (community) return community.color;
    }
  }
  // Fall back to type color
  const type = node.type;
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
};

const Graph2D = function Graph2D(props: Graph2DProps) {
  const {
    filters,
    linkOpacity,
    nodeRelSize,
    physics,
    subredditSize = "subscribers",
    focusNodeId,
    selectedId,
    onNodeSelect,
    showLabels,
    communityResult,
    usePrecomputedLayout,
  } = props;

  const [onlyLinked, setOnlyLinked] = useState(true);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<D3Node, D3Link> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const frameThrottlerRef = useRef<FrameThrottler | null>(null);
  const needsRenderRef = useRef(false);
  const linkGroupRef = useRef<d3.Selection<SVGLineElement, D3Link, SVGGElement, unknown> | null>(null);
  const nodeGroupRef = useRef<d3.Selection<SVGCircleElement, D3Node, SVGGElement, unknown> | null>(null);
  const labelGroupRef = useRef<d3.Selection<SVGTextElement, D3Node, SVGGElement, unknown> | null>(null);

  const MAX_RENDER_NODES = useMemo(() => {
    const raw = import.meta.env?.VITE_MAX_RENDER_NODES as unknown as
      | string
      | number
      | undefined;
    const n = typeof raw === "string" ? parseInt(raw) : Number(raw);
    return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 20000;
  }, []);

  const MAX_RENDER_LINKS = useMemo(() => {
    const raw = import.meta.env?.VITE_MAX_RENDER_LINKS as unknown as
      | string
      | number
      | undefined;
    const n = typeof raw === "string" ? parseInt(raw) : Number(raw);
    return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 50000;
  }, []);

  const activeTypes = useMemo(() => {
    return Object.entries(filters)
      .filter(([, value]) => value)
      .map(([key]) => key);
  }, [filters]);

  const activeTypesRef = useRef<string[]>(activeTypes);

  useEffect(() => {
    activeTypesRef.current = activeTypes;
  }, [activeTypes]);

  const load = useCallback(
    async ({
      signal,
      types,
    }: { signal?: AbortSignal; types?: string[] } = {}) => {
      const selected =
        types && types.length > 0 ? types : activeTypesRef.current;
      if (!selected || selected.length === 0) {
        setGraphData({ nodes: [], links: [] });
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const base = (import.meta.env?.VITE_API_URL || "/api").replace(
          /\/$/,
          ""
        );
        const params = new URLSearchParams({
          max_nodes: String(MAX_RENDER_NODES),
          max_links: String(MAX_RENDER_LINKS),
        });
        // Request precomputed positions when enabled
        if (usePrecomputedLayout) params.set("with_positions", "true");
        if (selected.length > 0) {
          params.set("types", selected.join(","));
        }
        const url = `${base}/graph?${params.toString()}`;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as GraphData;
        setGraphData(data);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError((err as Error).message);
        setGraphData(null);
      } finally {
        if (!signal || !signal.aborted) {
          setLoading(false);
        }
      }
    },
    [MAX_RENDER_LINKS, MAX_RENDER_NODES, usePrecomputedLayout]
  );

  useEffect(() => {
    if (activeTypes.length === 0) {
      setGraphData({ nodes: [], links: [] });
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    load({ signal: controller.signal, types: activeTypes });
    return () => controller.abort();
  }, [activeTypes, load]);

  // Filter logic
  const allowed = useMemo(
    () =>
      new Set(
        Object.entries(filters)
          .filter(([, v]) => v)
          .map(([k]) => k)
      ),
    [filters]
  );

  const allNodes = useMemo(() => graphData?.nodes ?? [], [graphData]);
  const allLinks = useMemo(() => graphData?.links ?? [], [graphData]);
  const filteredNodes = useMemo(
    () => allNodes.filter((n) => !n.type || allowed.has(n.type)),
    [allNodes, allowed]
  );
  const nodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );
  const links = useMemo(
    () =>
      allLinks.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target)),
    [allLinks, nodeIds]
  );

  const degreeMap = useMemo(() => buildDegreeMap(links), [links]);
  const subredditMetric = useMemo(
    () => computeSubredditMetric(subredditSize, links, filteredNodes),
    [links, filteredNodes, subredditSize]
  );

  const userMetric = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) {
      const s = String(l.source);
      const t = String(l.target);
      if (s.startsWith("user_") && t.startsWith("post_"))
        m.set(s, (m.get(s) || 0) + 1.5);
      else if (s.startsWith("user_") && t.startsWith("comment_"))
        m.set(s, (m.get(s) || 0) + 1);
    }
    return m;
  }, [links]);

  const linkedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of links) {
      ids.add(l.source);
      ids.add(l.target);
    }
    return ids;
  }, [links]);

  const filtered: GraphData = useMemo(() => {
    const baseNodes = onlyLinked
      ? filteredNodes.filter((n) => linkedNodeIds.has(n.id))
      : filteredNodes;

    if (
      baseNodes.length <= MAX_RENDER_NODES &&
      links.length <= MAX_RENDER_LINKS
    ) {
      return { nodes: baseNodes, links };
    }

    const nodeWeight = new Map<string, number>();
    for (const n of baseNodes) {
      let w = degreeMap.get(n.id) || 0;
      if (n.type === "subreddit") w = subredditMetric.get(n.id) ?? w;
      const raw: unknown = (n as { val?: unknown }).val;
      if (typeof raw === "number") w = Math.max(w, raw);
      else if (typeof raw === "string") {
        const p = parseFloat(raw);
        if (!Number.isNaN(p)) w = Math.max(w, p);
      }
      nodeWeight.set(n.id, w);
    }

    const sorted = baseNodes
      .slice()
      .sort((a, b) => nodeWeight.get(b.id)! - nodeWeight.get(a.id)!);
    const picked = sorted.slice(0, MAX_RENDER_NODES);
    const pickedIds = new Set(picked.map((n) => n.id));
    const keptLinks: typeof links = [];
    for (const l of links) {
      if (pickedIds.has(l.source) && pickedIds.has(l.target)) {
        keptLinks.push(l);
        if (keptLinks.length >= MAX_RENDER_LINKS) break;
      }
    }
    return { nodes: picked, links: keptLinks };
  }, [
    onlyLinked,
    filteredNodes,
    linkedNodeIds,
    links,
    MAX_RENDER_NODES,
    MAX_RENDER_LINKS,
    degreeMap,
    subredditMetric,
  ]);

  // Detect if backend provided precomputed positions for most nodes
  const hasPrecomputedPositions = useMemo(() => {
    if (!usePrecomputedLayout) return false;
    const n = filtered.nodes.length;
    if (n === 0) return false;
    let withPos = 0;
    for (const node of filtered.nodes as Array<
      GraphNode & { x?: number; y?: number }
    >) {
      if (typeof node.x === "number" && typeof node.y === "number") withPos++;
    }
    return withPos / n > 0.7;
  }, [filtered, usePrecomputedLayout]);

  const nodeValFn = useCallback(
    (node: D3Node) => {
      const t = node.type;
      const raw: unknown = node.val;
      let v = 0;
      if (typeof raw === "number") v = raw;
      else if (typeof raw === "string") {
        const parsed = parseFloat(raw);
        if (!Number.isNaN(parsed)) v = parsed;
      }
      if (!v) v = degreeMap.get(node.id) || 1;
      switch (t) {
        case "subreddit": {
          let sv = subredditMetric.get(node.id) ?? v;
          if (!sv) sv = degreeMap.get(node.id) || 1;
          return Math.max(2, Math.pow(sv, 0.35));
        }
        case "user": {
          const uv = userMetric.get(node.id) ?? v;
          return Math.max(1.5, Math.pow(uv, 0.5));
        }
        case "post":
          return 1.4;
        case "comment":
          return 1;
        default:
          return Math.max(1, Math.pow(v, 0.5));
      }
    },
    [degreeMap, subredditMetric, userMetric]
  );

  // Main D3 rendering effect
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (filtered.nodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);
    svg.attr("width", width).attr("height", height);

    // Create a group for zoom/pan
    const g = svg.append("g");

    // Setup zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Clone nodes/links for D3 (preserve any precomputed x/y from backend)
    const nodes: D3Node[] = filtered.nodes.map((n) => ({ ...n }));
    const links: D3Link[] = filtered.links.map((l) => ({ ...l }));

    // Create simulation
    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force(
        "link",
        d3
          .forceLink<D3Node, D3Link>(links)
          .id((d) => d.id)
          .distance(physics.linkDistance)
      )
      .force("charge", d3.forceManyBody().strength(physics.chargeStrength))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3
          .forceCollide<D3Node>()
          .radius((d) => nodeValFn(d) * nodeRelSize + physics.collisionRadius)
      )
      .velocityDecay(physics.velocityDecay);

    simulationRef.current = simulation;

    // If most nodes already have positions, quickly settle and fit view
    if (hasPrecomputedPositions) {
      // Increase alphaDecay so it cools faster and doesn't drift far from provided layout
      simulation.alpha(0.15).alphaDecay(0.15);
    }

    // Draw links
    const linkGroup = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", linkOpacity)
      .attr("stroke-width", 1);
    
    linkGroupRef.current = linkGroup;

    // Draw nodes
    const nodeGroup = g
      .append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", (d) => nodeValFn(d) * nodeRelSize)
      .attr("fill", (d) => getNodeColor(d, communityResult))
      .attr("stroke", (d) =>
        selectedId === d.id || selectedId === d.name ? "#fff" : "none"
      )
      .attr("stroke-width", 2)
      .call(
        d3
          .drag<SVGCircleElement, D3Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on("click", (_event, d) => {
        onNodeSelect?.(d.name || d.id);
      })
      .on("mouseover", function () {
        d3.select(this).attr("stroke", "#fff").attr("stroke-width", 2);
      })
      .on("mouseout", function (event, d) {
        void event; // mark used to satisfy lint for unused param
        if (selectedId !== d.id && selectedId !== d.name) {
          d3.select(this).attr("stroke", "none");
        }
      });

    // Add titles (tooltips)
    nodeGroup.append("title").text((d) => d.name || d.id);
    
    nodeGroupRef.current = nodeGroup;

    // Add labels if enabled
    let labelGroup: d3.Selection<
      SVGTextElement,
      D3Node,
      SVGGElement,
      unknown
    > | null = null;

    if (showLabels) {
      // Select top nodes by weight
      const weights = nodes.map((n) => {
        const deg = degreeMap.get(n.id) || 0;
        const val = typeof n.val === "number" ? n.val : 0;
        const w = Math.max(val, deg);
        return { node: n, w };
      });
      const preferred = weights.filter(
        (x) => x.node.type === "subreddit" || x.node.type === "user"
      );
      preferred.sort((a, b) => b.w - a.w);
      const TOP = Math.min(200, preferred.length);
      const labelNodes = preferred.slice(0, TOP).map((x) => x.node);

      labelGroup = g
        .append("g")
        .attr("class", "labels")
        .selectAll("text")
        .data(labelNodes)
        .enter()
        .append("text")
        .text((d) => {
          const name = d.name || d.id;
          return name.length > 28 ? name.slice(0, 27) + "…" : name;
        })
        .attr("font-size", (d) => {
          const deg = degreeMap.get(d.id) || 1;
          const base = Math.max(2, Math.pow(deg, 0.35));
          return 6 + Math.min(10, base);
        })
        .attr("fill", "#fff")
        .attr("text-anchor", "middle")
        .attr("pointer-events", "none")
        .style("user-select", "none");
      
      labelGroupRef.current = labelGroup;
    } else {
      labelGroupRef.current = null;
    }

    // If we have precomputed positions, fit the initial view to the layout bounds
    if (hasPrecomputedPositions) {
      const xs = nodes
        .map((n) => n.x)
        .filter((v): v is number => typeof v === "number");
      const ys = nodes
        .map((n) => n.y)
        .filter((v): v is number => typeof v === "number");
      if (xs.length > 0 && ys.length > 0) {
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const dx = Math.max(1, maxX - minX);
        const dy = Math.max(1, maxY - minY);
        const margin = 20;
        const sx = (width - margin * 2) / dx;
        const sy = (height - margin * 2) / dy;
        const scale = Math.max(0.1, Math.min(10, Math.min(sx, sy)));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const tx = width / 2 - cx * scale;
        const ty = height / 2 - cy * scale;
        const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        svg.call(zoom.transform, transform);
      }
    }

    // Initialize frame throttler for render updates
    if (!frameThrottlerRef.current) {
      frameThrottlerRef.current = new FrameThrottler({
        activeFps: 60,
        idleFps: 15,
        idleTimeout: 2000,
      });
    }

    const throttler = frameThrottlerRef.current;

    // Update positions on tick with throttling
    simulation.on("tick", () => {
      needsRenderRef.current = true;
    });

    // Throttled render loop
    throttler.start(() => {
      if (!needsRenderRef.current) return;
      needsRenderRef.current = false;
      
      const currentLinkGroup = linkGroupRef.current;
      const currentNodeGroup = nodeGroupRef.current;
      const currentLabelGroup = labelGroupRef.current;
      
      if (currentLinkGroup) {
        currentLinkGroup
          .attr("x1", (d) => (d.source as D3Node).x ?? 0)
          .attr("y1", (d) => (d.source as D3Node).y ?? 0)
          .attr("x2", (d) => (d.target as D3Node).x ?? 0)
          .attr("y2", (d) => (d.target as D3Node).y ?? 0);
      }

      if (currentNodeGroup) {
        currentNodeGroup.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
      }

      if (currentLabelGroup) {
        currentLabelGroup.attr("x", (d) => d.x ?? 0).attr("y", (d) => (d.y ?? 0) - 10);
      }
    });

    // Run for initial layout
    if (hasPrecomputedPositions) {
      // With precomputed positions, a gentle nudge is enough
      simulation.alpha(0.15).restart();
    } else {
      simulation.alpha(1).restart();
    }

    return () => {
      simulation.stop();
      simulationRef.current = null;
      throttler.stop();
    };
  }, [
    filtered,
    physics,
    nodeRelSize,
    linkOpacity,
    selectedId,
    onNodeSelect,
    showLabels,
    degreeMap,
    nodeValFn,
    communityResult,
    hasPrecomputedPositions,
  ]);

  // Focus on node
  useEffect(() => {
    if (!focusNodeId || !svgRef.current || !simulationRef.current) return;

    const match = filtered.nodes.find(
      (n) =>
        n.id === focusNodeId ||
        n.name?.toLowerCase() === focusNodeId.toLowerCase()
    );
    if (!match) return;

    const node = simulationRef.current.nodes().find((n) => n.id === match.id);
    if (!node || node.x === undefined || node.y === undefined) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Calculate transform to center the node
    const scale = 1.5;
    const x = width / 2 - node.x * scale;
    const y = height / 2 - node.y * scale;

    const z = zoomRef.current;
    if (!z) return;
    const transform = d3.zoomIdentity.translate(x, y).scale(scale);
    svg.call(z.transform, transform);
  }, [focusNodeId, filtered]);

  const isLoading = loading;

  return (
    <div 
      ref={containerRef} 
      className="w-full h-screen relative bg-black"
      onMouseMove={() => frameThrottlerRef.current?.markActive()}
      onWheel={() => frameThrottlerRef.current?.markActive()}
      onMouseDown={() => frameThrottlerRef.current?.markActive()}
      onTouchStart={() => frameThrottlerRef.current?.markActive()}
      onTouchMove={() => frameThrottlerRef.current?.markActive()}
    >
      {error && (
        <div className="absolute top-2 left-2 z-20 bg-red-900/70 text-red-100 rounded px-3 py-2 text-sm">
          Error: {error}
        </div>
      )}
      {isLoading && (
        <div className="absolute top-2 left-2 z-20 bg-black/50 text-white rounded px-3 py-2 text-sm">
          Loading graph…
        </div>
      )}
      {!isLoading && activeTypes.length === 0 && (
        <div className="absolute top-2 left-2 z-20 bg-black/50 text-white rounded px-3 py-2 text-sm">
          Enable at least one node type in the controls to view the graph.
        </div>
      )}
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
        <span
          title={
            usePrecomputedLayout
              ? hasPrecomputedPositions
                ? "Using precomputed node positions from backend"
                : "Precomputed layout enabled, but this dataset has no stored positions"
              : "Using client-side simulation"
          }
          className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            usePrecomputedLayout && hasPrecomputedPositions
              ? "bg-emerald-700/70 text-emerald-100 border border-emerald-500/40"
              : "bg-slate-700/70 text-slate-100 border border-slate-500/40"
          }`}
        >
          Layout:{" "}
          {usePrecomputedLayout && hasPrecomputedPositions
            ? "Precomputed"
            : "Simulated"}
        </span>
      </div>
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

export default Graph2D;
