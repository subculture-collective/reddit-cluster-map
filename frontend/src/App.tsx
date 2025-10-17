import Controls from "./components/Controls.tsx";
import Communities from "./components/Communities";
import Dashboard from "./components/Dashboard";
import Graph2D from "./components/Graph2D";
import Graph3D from "./components/Graph3D.tsx";
import Inspector from "./components/Inspector.tsx";
import type { TypeFilters } from "./types/ui";
import type { CommunityResult } from "./utils/communityDetection";
import { useEffect, useState } from "react";

function App() {
  const [filters, setFilters] = useState<TypeFilters>({
    subreddit: true,
    user: true,
    post: false,
    comment: false,
  });
  const [linkOpacity, setLinkOpacity] = useState(0.35);
  const [nodeRelSize, setNodeRelSize] = useState(5);
  const [physics, setPhysics] = useState({
    chargeStrength: -220,
    linkDistance: 120,
    velocityDecay: 0.88,
    cooldownTicks: 80,
    collisionRadius: 3,
  });
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>();
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [subredditSize, setSubredditSize] = useState<
    "subscribers" | "activeUsers" | "contentActivity" | "interSubLinks"
  >("subscribers");
  const [viewMode, setViewMode] = useState<
    "3d" | "2d" | "dashboard" | "communities"
  >(() => {
    const saved =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("viewMode")
        : null;
    if (
      saved === "2d" ||
      saved === "3d" ||
      saved === "dashboard" ||
      saved === "communities"
    ) {
      return saved;
    }
    return "3d";
  });
  const [communityResult, setCommunityResult] =
    useState<CommunityResult | null>(null);
  const [useCommunityColors, setUseCommunityColors] = useState(false);
  const [usePrecomputedLayout, setUsePrecomputedLayout] = useState<boolean>(
    () => {
      try {
        const saved = localStorage.getItem("usePrecomputedLayout");
        if (saved === "true" || saved === "false") return saved === "true";
      } catch {
        /* ignore */
      }
      return true; // default: on
    }
  );

  // Persist view mode
  useEffect(() => {
    try {
      localStorage.setItem("viewMode", viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "usePrecomputedLayout",
        usePrecomputedLayout ? "true" : "false"
      );
    } catch {
      /* ignore */
    }
  }, [usePrecomputedLayout]);

  return (
    <div className="w-full h-screen">
      {viewMode === "dashboard" ? (
        <Dashboard
          onViewMode={(mode: "3d" | "2d") => {
            setViewMode(mode);
          }}
          onFocusNode={(id) => {
            setFocusNodeId(id);
            setSelectedId(id);
          }}
        />
      ) : viewMode === "communities" ? (
        <Communities
          onViewMode={(mode: "3d" | "2d") => {
            setViewMode(mode);
          }}
          onFocusNode={(id) => {
            setFocusNodeId(id);
            setSelectedId(id);
          }}
          onApplyCommunityColors={(result) => {
            setCommunityResult(result);
            setUseCommunityColors(true);
          }}
        />
      ) : (
        <>
          <Controls
            filters={filters}
            onFiltersChange={setFilters}
            linkOpacity={linkOpacity}
            onLinkOpacityChange={setLinkOpacity}
            nodeRelSize={nodeRelSize}
            onNodeRelSizeChange={setNodeRelSize}
            physics={physics}
            onPhysicsChange={setPhysics}
            subredditSize={subredditSize}
            onSubredditSizeChange={setSubredditSize}
            onFocusNode={setFocusNodeId}
            showLabels={showLabels}
            onShowLabelsChange={setShowLabels}
            graphMode={viewMode === "3d" ? "3d" : "2d"}
            onGraphModeChange={(mode) => setViewMode(mode)}
            onShowDashboard={() => setViewMode("dashboard")}
            onShowCommunities={() => setViewMode("communities")}
            useCommunityColors={useCommunityColors}
            onToggleCommunityColors={(enabled) =>
              setUseCommunityColors(enabled)
            }
            usePrecomputedLayout={usePrecomputedLayout}
            onTogglePrecomputedLayout={(enabled) =>
              setUsePrecomputedLayout(enabled)
            }
          />
          {viewMode === "3d" ? (
            <Graph3D
              filters={filters}
              linkOpacity={linkOpacity}
              nodeRelSize={nodeRelSize}
              physics={physics}
              subredditSize={subredditSize}
              focusNodeId={focusNodeId}
              showLabels={showLabels}
              selectedId={selectedId}
              onNodeSelect={(id?: string) => {
                setFocusNodeId(id);
                setSelectedId(id);
              }}
              communityResult={useCommunityColors ? communityResult : null}
              usePrecomputedLayout={usePrecomputedLayout}
            />
          ) : (
            <Graph2D
              filters={filters}
              linkOpacity={linkOpacity}
              nodeRelSize={nodeRelSize}
              physics={physics}
              subredditSize={subredditSize}
              focusNodeId={focusNodeId}
              showLabels={showLabels}
              selectedId={selectedId}
              onNodeSelect={(id?: string) => {
                setFocusNodeId(id);
                setSelectedId(id);
              }}
              communityResult={useCommunityColors ? communityResult : null}
              usePrecomputedLayout={usePrecomputedLayout}
            />
          )}
          <Inspector
            selected={selectedId ? { id: selectedId } : undefined}
            onClear={() => {
              setSelectedId(undefined);
              setFocusNodeId(undefined);
            }}
            onFocus={(id) => {
              setFocusNodeId(id);
              setSelectedId(id);
            }}
          />
        </>
      )}
    </div>
  );
}

export default App;
