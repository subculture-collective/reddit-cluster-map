import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ForceGraphMethods,
  LinkObject as RFLinkObject,
  NodeObject as RFNodeObject,
} from "react-force-graph-3d";
import ForceGraph3D from "react-force-graph-3d";
import type { GraphData, GraphNode } from "../types/graph";
import SpriteText from "three-spritetext";
import { FrameThrottler } from "../utils/frameThrottle";
import {
  calculateLinkOpacity,
  shouldShowLabels,
  DEFAULT_LOD_CONFIG,
} from "../utils/levelOfDetail";

type Filters = {
  subreddit: boolean;
  user: boolean;
  post: boolean;
  comment: boolean;
};

const TYPE_ORDER: Array<keyof Filters> = [
  "subreddit",
  "user",
  "post",
  "comment",
];

type SubSizeMode =
  | "subscribers"
  | "activeUsers"
  | "contentActivity"
  | "interSubLinks";

// Minimal FG instance surface we use
type FGApi = {
  camera?: () => { position?: { x: number; y: number; z: number } } | undefined;
  cameraPosition?: (
    pos: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    ms?: number
  ) => void;
  d3Force?: (name: string, force?: unknown) => unknown;
  d3VelocityDecay?: (d: number) => void;
  cooldownTicks?: (t: number) => void;
  nodeVal?: () => (n: unknown) => number;
  nodeRelSize?: () => number;
};

type FGNode = {
  id?: string | number;
  x?: number;
  y?: number;
  z?: number;
  [k: string]: unknown;
};
type FGLink = {
  source: string | number | FGNode;
  target: string | number | FGNode;
  [k: string]: unknown;
};
// (no FGGraph alias needed)

// ---- helpers ----

const buildDegreeMap = (links: { source: string; target: string }[]) => {
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

const metricActiveUsers = (links: { source: string; target: string }[]) => {
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

const metricInterSubLinks = (links: { source: string; target: string }[]) => {
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

const metricContentActivity = (links: { source: string; target: string }[]) => {
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
  links: { source: string; target: string }[],
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

// ---- d3 force helpers ----
const setCharge = (fg: unknown, strength: number) => {
  const charge = (fg as { d3Force?: (name: string) => unknown }).d3Force?.(
    "charge"
  ) as { strength?: (s: number) => void } | undefined;
  if (charge && typeof charge.strength === "function")
    charge.strength(strength);
};
const setLinkDistance = (fg: unknown, distance: number) => {
  const link = (fg as { d3Force?: (name: string) => unknown }).d3Force?.(
    "link"
  ) as { distance?: (d: number) => void } | undefined;
  if (link && typeof link.distance === "function") link.distance(distance);
};
const setDamping = (fg: unknown, decay: number) => {
  const api = fg as { d3VelocityDecay?: (d: number) => void };
  if (typeof api.d3VelocityDecay === "function") api.d3VelocityDecay(decay);
};
const setCooldown = (fg: unknown, ticks: number) => {
  const api = fg as { cooldownTicks?: (t: number) => void };
  if (typeof api.cooldownTicks === "function") api.cooldownTicks(ticks);
};
const setCollision = (fg: unknown, radius: number) => {
  const collide = (
    fg as { d3Force?: (name: string, force?: unknown) => unknown }
  ).d3Force?.("collide") as
    | { radius?: (r: (n: unknown) => number) => void }
    | undefined;
  if (radius <= 0) {
    if (collide)
      (
        fg as { d3Force?: (name: string, force?: unknown) => unknown }
      ).d3Force?.("collide", null);
    return;
  }
  const nodeValAccessor =
    typeof (fg as { nodeVal?: () => unknown }).nodeVal === "function"
      ? (fg as { nodeVal?: () => unknown }).nodeVal!()
      : null;
  const relSize =
    typeof (fg as { nodeRelSize?: () => number }).nodeRelSize === "function"
      ? (fg as { nodeRelSize?: () => number }).nodeRelSize!()
      : 4;
  const radiusFn = (n: unknown) => {
    if (typeof nodeValAccessor === "function") {
      try {
        const size =
          Number((nodeValAccessor as (n: unknown) => unknown)(n)) || 1;
        return size * relSize + radius;
      } catch {
        /* noop */
      }
    }
    const node = n as { val?: number };
    const base = typeof node?.val === "number" ? node.val : 1;
    return base + radius;
  };
  if (collide && typeof collide.radius === "function") {
    collide.radius(radiusFn);
    return;
  }
  if (
    typeof (fg as { d3Force?: (name: string, force?: unknown) => unknown })
      .d3Force === "function"
  ) {
    (fg as { d3Force?: (name: string, force?: unknown) => unknown }).d3Force!(
      "collide",
      d3.forceCollide(radiusFn)
    );
  }
};

const applyPhysics = (
  fg: unknown,
  physics?: {
    chargeStrength: number;
    linkDistance: number;
    velocityDecay: number;
    cooldownTicks: number;
    collisionRadius?: number;
  }
) => {
  if (!fg || !physics) return;
  setCharge(fg, physics.chargeStrength);
  setLinkDistance(fg, physics.linkDistance);
  setDamping(fg, physics.velocityDecay);
  setCooldown(fg, physics.cooldownTicks);
  setCollision(fg, physics.collisionRadius ?? 0);
};

interface Props {
  filters: Filters;
  minDegree?: number;
  maxDegree?: number;
  linkOpacity: number;
  nodeRelSize: number;
  physics?: {
    chargeStrength: number;
    linkDistance: number;
    velocityDecay: number;
    cooldownTicks: number;
    collisionRadius?: number;
  };
  subredditSize?: SubSizeMode;
  focusNodeId?: string;
  selectedId?: string;
  onNodeSelect?: (id?: string) => void;
  showLabels?: boolean; // when true, render always-on label sprites for key nodes
  communityResult?: {
    nodeCommunities: Map<string, number>;
    communities: Array<{ id: number; color: string }>;
  } | null;
  usePrecomputedLayout?: boolean;
  initialCamera?: { x: number; y: number; z: number };
  onCameraChange?: (camera: { x: number; y: number; z: number }) => void;
}

export default function Graph3D(props: Props) {
  const {
    filters,
    minDegree,
    maxDegree,
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
    initialCamera,
    onCameraChange,
  } = props;

  const [onlyLinked, setOnlyLinked] = useState(true);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Ref typed as expected by ForceGraph3D definition
  const fgRef = useRef<
    ForceGraphMethods<RFNodeObject, RFLinkObject> | undefined
  >(undefined);
  const cameraDistRef = useRef<number>(Infinity);
  const frameThrottlerRef = useRef<FrameThrottler | null>(null);
  const [adaptiveLinkOpacity, setAdaptiveLinkOpacity] = useState(linkOpacity);
  const [adaptiveShowLabels, setAdaptiveShowLabels] = useState(showLabels);

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
  const CAMERA_ANIMATION_DURATION_MS = useMemo(() => {
    const raw = import.meta.env?.VITE_CAMERA_ANIMATION_DURATION_MS as unknown as
      | string
      | number
      | undefined;
    const n = typeof raw === "string" ? parseInt(raw) : Number(raw);
    return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 1500;
  }, []);

  const activeTypes = useMemo(() => {
    const enabled = Object.entries(filters)
      .filter(([, value]) => value)
      .map(([key]) => key as keyof Filters);
    return enabled.sort(
      (a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)
    );
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
        // Request precomputed positions only when enabled
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

  useEffect(() => {
    // Initialize frame throttler
    if (!frameThrottlerRef.current) {
      frameThrottlerRef.current = new FrameThrottler({
        activeFps: 60,
        idleFps: 10,
        idleTimeout: 2000,
      });
    }

    const throttler = frameThrottlerRef.current;
    
    throttler.start(() => {
      try {
        const cam = (fgRef.current as unknown as FGApi | undefined)?.camera?.();
        if (cam?.position) {
          const { x, y, z } = cam.position;
          const dist = Math.hypot(x, y, z);
          cameraDistRef.current = dist;
          
          // Update adaptive LOD settings based on camera distance
          const newOpacity = calculateLinkOpacity(dist, linkOpacity, DEFAULT_LOD_CONFIG);
          setAdaptiveLinkOpacity(prev => (prev !== newOpacity ? newOpacity : prev));
          
          const newShowLabels = showLabels && shouldShowLabels(dist, DEFAULT_LOD_CONFIG);
          setAdaptiveShowLabels(prev => (prev !== newShowLabels ? newShowLabels : prev));
        }
      } catch {
        /* noop */
      }
    });

    return () => {
      throttler.stop();
    };
  }, [linkOpacity, showLabels]);

  useEffect(() => {
    try {
      applyPhysics(fgRef.current as unknown as FGApi | undefined, physics);
    } catch {
      /* noop */
    }
  }, [physics]);

  const getColor = useMemo(
    () => (node: unknown) => {
      const n = node as GraphNode;
      // Use community color if available
      if (communityResult) {
        const commId = communityResult.nodeCommunities.get(n.id);
        if (commId !== undefined) {
          const community = communityResult.communities.find(
            (c) => c.id === commId
          );
          if (community) return community.color;
        }
      }
      // Fall back to type color
      const type = n.type;
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
    [communityResult]
  );

  // focus camera
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
    const {
      x = 0,
      y = 0,
      z = 0,
    } = match as unknown as { x?: number; y?: number; z?: number };
    // cameraPosition available on ForceGraphMethods
    (fgRef.current as unknown as FGApi | undefined)?.cameraPosition?.(
      { x: x * distRatio, y: y * distRatio, z: z * distRatio },
      { x, y, z },
      CAMERA_ANIMATION_DURATION_MS
    );
  }, [focusNodeId, graphData, CAMERA_ANIMATION_DURATION_MS]);

  // Set initial camera position from URL state
  useEffect(() => {
    if (!initialCamera || !fgRef.current) return;
    const fg = fgRef.current as unknown as FGApi | undefined;
    if (fg?.cameraPosition) {
      fg.cameraPosition(initialCamera, { x: 0, y: 0, z: 0 }, 0);
    }
  }, [initialCamera]);

  // Track camera changes for URL state
  useEffect(() => {
    if (!onCameraChange || !fgRef.current) return;

    const lastCamPos = { x: NaN, y: NaN, z: NaN };
    const EPSILON = 1e-3;

    const interval = setInterval(() => {
      const fg = fgRef.current as unknown as FGApi | undefined;
      const cam = fg?.camera?.();
      if (cam?.position) {
        const { x, y, z } = cam.position;
        // Only update if position changed significantly
        if (
          Math.abs(x - lastCamPos.x) > EPSILON ||
          Math.abs(y - lastCamPos.y) > EPSILON ||
          Math.abs(z - lastCamPos.z) > EPSILON
        ) {
          onCameraChange({ x, y, z });
          lastCamPos.x = x;
          lastCamPos.y = y;
          lastCamPos.z = z;
        }
      }
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [onCameraChange]);

  // filters and links
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

  // Apply degree threshold filters
  const degreeFilteredNodes = useMemo(() => {
    if (minDegree === undefined && maxDegree === undefined) {
      return filteredNodes;
    }
    return filteredNodes.filter((n) => {
      const degree = degreeMap.get(n.id) || 0;
      if (minDegree !== undefined && degree < minDegree) return false;
      if (maxDegree !== undefined && degree > maxDegree) return false;
      return true;
    });
  }, [filteredNodes, degreeMap, minDegree, maxDegree]);

  const degreeFilteredNodeIds = useMemo(
    () => new Set(degreeFilteredNodes.map((n) => n.id)),
    [degreeFilteredNodes]
  );

  const degreeFilteredLinks = useMemo(
    () =>
      links.filter((l) => degreeFilteredNodeIds.has(l.source) && degreeFilteredNodeIds.has(l.target)),
    [links, degreeFilteredNodeIds]
  );

  const subredditMetric = useMemo(
    () =>
      computeSubredditMetric(
        subredditSize || "subscribers",
        degreeFilteredLinks,
        degreeFilteredNodes
      ),
    [degreeFilteredLinks, degreeFilteredNodes, subredditSize]
  );

  const userMetric = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of degreeFilteredLinks) {
      const s = String(l.source);
      const t = String(l.target);
      if (s.startsWith("user_") && t.startsWith("post_"))
        m.set(s, (m.get(s) || 0) + 1.5);
      else if (s.startsWith("user_") && t.startsWith("comment_"))
        m.set(s, (m.get(s) || 0) + 1);
    }
    return m;
  }, [degreeFilteredLinks]);

  const linkedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of degreeFilteredLinks) {
      ids.add(l.source);
      ids.add(l.target);
    }
    return ids;
  }, [degreeFilteredLinks]);

  const filtered: GraphData = useMemo(() => {
    const baseNodes = onlyLinked
      ? degreeFilteredNodes.filter((n) => linkedNodeIds.has(n.id))
      : degreeFilteredNodes;

    if (
      baseNodes.length <= MAX_RENDER_NODES &&
      degreeFilteredLinks.length <= MAX_RENDER_LINKS
    ) {
      return { nodes: baseNodes, links: degreeFilteredLinks };
    }

    const nodeWeight = new Map<string, number>();
    for (const n of baseNodes) {
      let w = degreeMap.get(n.id) || 0;
      if (n.type === "subreddit") w = subredditMetric.get(n.id) ?? w;
      if (n.type === "user") w = w + 0 || w;
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
    const keptLinks: typeof degreeFilteredLinks = [];
    for (const l of degreeFilteredLinks) {
      if (pickedIds.has(l.source) && pickedIds.has(l.target)) {
        keptLinks.push(l);
        if (keptLinks.length >= MAX_RENDER_LINKS) break;
      }
    }
    return { nodes: picked, links: keptLinks };
  }, [
    onlyLinked,
    degreeFilteredNodes,
    linkedNodeIds,
    degreeFilteredLinks,
    MAX_RENDER_NODES,
    MAX_RENDER_LINKS,
    degreeMap,
    subredditMetric,
  ]);

  const isLoading = loading;

  const nodeValFn = useMemo(
    () => (node: unknown) => {
      const n = node as unknown as GraphNode & { val?: unknown };
      const t = n.type;
      const raw: unknown = (n as { val?: unknown }).val;
      let v = 0;
      if (typeof raw === "number") v = raw;
      else if (typeof raw === "string") {
        const parsed = parseFloat(raw);
        if (!Number.isNaN(parsed)) v = parsed;
      }
      if (!v) v = degreeMap.get(n.id) || 1;
      switch (t) {
        case "subreddit": {
          let sv = subredditMetric.get(n.id) ?? v;
          if (!sv) sv = degreeMap.get(n.id) || 1;
          return Math.max(2, Math.pow(sv, 0.35));
        }
        case "user": {
          const uv = userMetric.get(n.id) ?? v;
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

  const selectedActiveId = useMemo(() => {
    if (!selectedId) return undefined;
    if (filtered.nodes.some((n) => n.id === selectedId)) return selectedId;
    const byName = filtered.nodes.find(
      (n) => n.name?.toLowerCase() === selectedId.toLowerCase()
    );
    return byName?.id;
  }, [selectedId, filtered]);

  const EDGE_VIS_THRESHOLD = 1200;
  const linkVisibilityFn = useCallback(
    (l?: { source?: string | number; target?: string | number }) => {
      if (selectedActiveId && l) {
        const s = String(l.source ?? "");
        const t = String(l.target ?? "");
        if (s === selectedActiveId || t === selectedActiveId) return true;
      }
      return cameraDistRef.current < EDGE_VIS_THRESHOLD;
    },
    [selectedActiveId]
  );

  const hasPrecomputedPositions = useMemo(() => {
    if (!usePrecomputedLayout) return false;
    const n = filtered.nodes.length;
    if (n === 0) return false;
    let withPos = 0;
    for (const node of filtered.nodes as Array<
      GraphNode & { x?: number; y?: number; z?: number }
    >) {
      if (
        typeof node.x === "number" &&
        typeof node.y === "number" &&
        typeof node.z === "number"
      )
        withPos++;
    }
    return withPos / n > 0.7;
  }, [filtered, usePrecomputedLayout]);

  // choose a set of nodes to label when always-on labels are enabled
  const labelSet = useMemo(() => {
    if (!adaptiveShowLabels) return new Set<string>();
    const nodes = filtered.nodes as GraphNode[];
    const weights = nodes.map((n) => {
      const deg = degreeMap.get(n.id) || 0;
      const val = typeof n.val === "number" ? n.val : 0;
      const w = Math.max(val, deg);
      return { id: n.id, type: n.type, name: n.name || n.id, w };
    });
    // Prefer subreddits/users; limit to top N by weight
    const preferred = weights.filter(
      (x) => x.type === "subreddit" || x.type === "user"
    );
    preferred.sort(
      (a, b) => b.w - a.w || String(a.id).localeCompare(String(b.id))
    );
    const TOP = Math.min(DEFAULT_LOD_CONFIG.maxLabels, preferred.length);
    const set = new Set<string>();
    for (let i = 0; i < TOP; i++) set.add(String(preferred[i].id));
    return set;
  }, [adaptiveShowLabels, filtered, degreeMap]);

  return (
    <div 
      className="w-full h-screen relative"
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
      <ForceGraph3D
        ref={fgRef}
        graphData={{
          nodes: filtered.nodes as unknown as FGNode[],
          links: filtered.links as unknown as FGLink[],
        }}
        // Always provide hover labels
        nodeLabel={"name"}
        nodeColor={getColor as unknown as (node: unknown) => string}
        nodeVal={nodeValFn as unknown as (n: unknown) => number}
        nodeRelSize={nodeRelSize}
        nodeThreeObject={
          adaptiveShowLabels
            ? (node: unknown) => {
                const n = node as GraphNode;
                const id = String(n.id);
                if (!labelSet.has(id)) return undefined as unknown as object;
                const name = (n.name || id).toString();
                const st = new SpriteText(
                  name.length > 28 ? name.slice(0, 27) + "…" : name
                );
                st.color = "#ffffff";
                // scale label size with node value moderately
                const deg = degreeMap.get(id) || 1;
                const base = Math.max(2, Math.pow(deg, 0.35));
                st.textHeight = 6 + Math.min(10, base);
                st.backgroundColor = "rgba(0,0,0,0.35)";
                st.padding = 2;
                return st as unknown as object;
              }
            : (undefined as unknown as (n: unknown) => object)
        }
        linkWidth={1}
        linkColor={() => "#999"}
        linkOpacity={adaptiveLinkOpacity}
        onNodeClick={(node: unknown) =>
          onNodeSelect?.((node as { name?: string })?.name)
        }
        backgroundColor="#000000"
        enableNodeDrag={false}
        linkDirectionalParticles={0}
        linkDirectionalArrowLength={0}
        linkVisibility={linkVisibilityFn as unknown as (l: unknown) => boolean}
        cooldownTicks={physics?.cooldownTicks ?? 1}
        cooldownTime={hasPrecomputedPositions ? 0 : undefined}
        warmupTicks={0}
        forceEngine="ngraph"
        rendererConfig={
          {
            antialias: false,
            powerPreference: "high-performance",
          } as unknown as WebGLContextAttributes
        }
      />
    </div>
  );
}
