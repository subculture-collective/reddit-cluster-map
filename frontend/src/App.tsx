import Admin from "./components/Admin";
import Controls from "./components/Controls.tsx";
import Communities from "./components/Communities";
import Dashboard from "./components/Dashboard";
import Graph2D from "./components/Graph2D";
import Graph3D from "./components/Graph3D.tsx";
import Inspector from "./components/Inspector.tsx";
import Legend from "./components/Legend.tsx";
import ShareButton from "./components/ShareButton.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import GraphErrorFallback from "./components/GraphErrorFallback.tsx";
import type { TypeFilters } from "./types/ui";
import type { CommunityResult } from "./utils/communityDetection";
import { readStateFromURL, writeStateToURL, type AppState } from "./utils/urlState";
import { useEffect, useState, useCallback, useRef } from "react";
import { detectWebGLSupport } from "./utils/webglDetect";

function App() {
  // Initialize state from URL if available
  const urlState = readStateFromURL();

  const [filters, setFilters] = useState<TypeFilters>(() => {
    if (urlState.filters) return urlState.filters;
    return {
      subreddit: true,
      user: true,
      post: false,
      comment: false,
    };
  });
  
  const [minDegree, setMinDegree] = useState<number | undefined>(urlState.minDegree);
  const [maxDegree, setMaxDegree] = useState<number | undefined>(urlState.maxDegree);
  
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
    "3d" | "2d" | "dashboard" | "communities" | "admin"
  >(() => {
    // Prefer URL state over localStorage
    if (urlState.viewMode) return urlState.viewMode;
    const saved =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("viewMode")
        : null;
    if (
      saved === "2d" ||
      saved === "3d" ||
      saved === "dashboard" ||
      saved === "communities" ||
      saved === "admin"
    ) {
      return saved;
    }
    return "3d";
  });
  const [communityResult, setCommunityResult] =
    useState<CommunityResult | null>(null);
  const [useCommunityColors, setUseCommunityColors] = useState(() => {
    if (urlState.useCommunityColors !== undefined) return urlState.useCommunityColors;
    return false;
  });
  const [usePrecomputedLayout, setUsePrecomputedLayout] = useState<boolean>(
    () => {
      if (urlState.usePrecomputedLayout !== undefined) return urlState.usePrecomputedLayout;
      try {
        const saved = localStorage.getItem("usePrecomputedLayout");
        if (saved === "true" || saved === "false") return saved === "true";
      } catch {
        /* ignore */
      }
      return true; // default: on
    }
  );
  
  const [camera3dRef, setCamera3dRef] = useState<{ x: number; y: number; z: number } | undefined>(urlState.camera3d);
  const [camera2dRef, setCamera2dRef] = useState<{ x: number; y: number; zoom: number } | undefined>(urlState.camera2d);

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

  // Sync state to URL with debouncing to avoid excessive history API calls
  const urlWriteTimeoutRef = useRef<number | null>(null);
  
  useEffect(() => {
    // Clear any pending timeout
    if (urlWriteTimeoutRef.current !== null) {
      clearTimeout(urlWriteTimeoutRef.current);
    }
    
    // Debounce URL writes by 500ms
    urlWriteTimeoutRef.current = window.setTimeout(() => {
      writeStateToURL({
        viewMode,
        filters,
        minDegree,
        maxDegree,
        camera3d: camera3dRef,
        camera2d: camera2dRef,
        useCommunityColors,
        usePrecomputedLayout,
      });
    }, 500);

    return () => {
      if (urlWriteTimeoutRef.current !== null) {
        clearTimeout(urlWriteTimeoutRef.current);
      }
    };
  }, [viewMode, filters, minDegree, maxDegree, camera3dRef, camera2dRef, useCommunityColors, usePrecomputedLayout]);

  // Callback to get current state for sharing
  const getShareState = useCallback((): AppState => ({
    viewMode,
    filters,
    minDegree,
    maxDegree,
    camera3d: camera3dRef,
    camera2d: camera2dRef,
    useCommunityColors,
    usePrecomputedLayout,
  }), [viewMode, filters, minDegree, maxDegree, camera3dRef, camera2dRef, useCommunityColors, usePrecomputedLayout]);

  return (
    <div className="w-full h-screen">
      {viewMode === "admin" ? (
        <Admin
          onViewMode={(mode: "3d" | "2d") => {
            setViewMode(mode);
          }}
        />
      ) : viewMode === "dashboard" ? (
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
            minDegree={minDegree}
            onMinDegreeChange={setMinDegree}
            maxDegree={maxDegree}
            onMaxDegreeChange={setMaxDegree}
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
            onShowAdmin={() => setViewMode("admin")}
            useCommunityColors={useCommunityColors}
            onToggleCommunityColors={(enabled) =>
              setUseCommunityColors(enabled)
            }
            usePrecomputedLayout={usePrecomputedLayout}
            onTogglePrecomputedLayout={(enabled) =>
              setUsePrecomputedLayout(enabled)
            }
          />
          <ShareButton getState={getShareState} />
          {viewMode === "3d" ? (
            <ErrorBoundary
              fallback={(error, retry) => (
                <GraphErrorFallback
                  error={error}
                  onRetry={retry}
                  onFallbackTo2D={() => setViewMode("2d")}
                  mode="3d"
                  webglSupported={detectWebGLSupport()}
                />
              )}
            >
              <Graph3D
                filters={filters}
                minDegree={minDegree}
                maxDegree={maxDegree}
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
                initialCamera={camera3dRef}
                onCameraChange={setCamera3dRef}
              />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary
              fallback={(error, retry) => (
                <GraphErrorFallback
                  error={error}
                  onRetry={retry}
                  mode="2d"
                />
              )}
            >
              <Graph2D
                filters={filters}
                minDegree={minDegree}
                maxDegree={maxDegree}
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
                initialCamera={camera2dRef}
                onCameraChange={setCamera2dRef}
              />
            </ErrorBoundary>
          )}
          <Legend
            filters={filters}
            useCommunityColors={useCommunityColors}
            communityCount={communityResult?.communities.length}
          />
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
