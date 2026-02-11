import Admin from "./components/Admin";
import Sidebar from "./components/Sidebar.tsx";
import Communities from "./components/Communities";
import Dashboard from "./components/Dashboard";
import Graph2D from "./components/Graph2D";
import Graph3D from "./components/Graph3D.tsx";
import Inspector from "./components/Inspector.tsx";
import Legend from "./components/Legend.tsx";
import ShareButton from "./components/ShareButton.tsx";
import SearchBar, { type SearchBarHandle } from "./components/SearchBar.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import GraphErrorFallback from "./components/GraphErrorFallback.tsx";
import KeyboardShortcutsHelp from "./components/KeyboardShortcutsHelp.tsx";
import type { TypeFilters } from "./types/ui";
import type { CommunityResult } from "./utils/communityDetection";
import { readStateFromURL, writeStateToURL, type AppState } from "./utils/urlState";
import { useEffect, useState, useCallback, useRef } from "react";
import { detectWebGLSupport } from "./utils/webglDetect";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

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
  const [physics, setPhysics] = useState<{
    chargeStrength: number;
    linkDistance: number;
    velocityDecay: number;
    cooldownTicks: number;
    collisionRadius: number;
    autoTune?: boolean;
  }>({
    chargeStrength: -220,
    linkDistance: 120,
    velocityDecay: 0.88,
    cooldownTicks: 80,
    collisionRadius: 3,
    autoTune: true, // Enable auto-tune by default for stability
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
  
  const [sizeAttenuation, setSizeAttenuation] = useState<boolean>(() => {
    if (urlState.sizeAttenuation !== undefined) return urlState.sizeAttenuation;
    return true; // default: enabled for better depth perception
  });
  
  const [enableAdaptiveLOD, setEnableAdaptiveLOD] = useState<boolean>(() => {
    if (urlState.enableAdaptiveLOD !== undefined) return urlState.enableAdaptiveLOD;
    try {
      const saved = localStorage.getItem("enableAdaptiveLOD");
      if (saved === "true" || saved === "false") return saved === "true";
    } catch {
      /* ignore */
    }
    return true; // default: enabled for better performance
  });
  
  const [currentLODTier, setCurrentLODTier] = useState<number>(3); // Start at HIGH tier
  
  const [camera3dRef, setCamera3dRef] = useState<{ x: number; y: number; z: number } | undefined>(urlState.camera3d);
  const [camera2dRef, setCamera2dRef] = useState<{ x: number; y: number; zoom: number } | undefined>(urlState.camera2d);
  
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  
  // Ref for search bar to enable focus from keyboard shortcuts
  const searchInputRef = useRef<SearchBarHandle | null>(null);

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
  
  useEffect(() => {
    try {
      localStorage.setItem(
        "enableAdaptiveLOD",
        enableAdaptiveLOD ? "true" : "false"
      );
    } catch {
      /* ignore */
    }
  }, [enableAdaptiveLOD]);

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
        sizeAttenuation,
        enableAdaptiveLOD,
      });
    }, 500);

    return () => {
      if (urlWriteTimeoutRef.current !== null) {
        clearTimeout(urlWriteTimeoutRef.current);
      }
    };
  }, [viewMode, filters, minDegree, maxDegree, camera3dRef, camera2dRef, useCommunityColors, usePrecomputedLayout, sizeAttenuation, enableAdaptiveLOD]);

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
    sizeAttenuation,
    enableAdaptiveLOD,
  }), [viewMode, filters, minDegree, maxDegree, camera3dRef, camera2dRef, useCommunityColors, usePrecomputedLayout, sizeAttenuation, enableAdaptiveLOD]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onFocusSearch: viewMode === "admin" ? undefined : useCallback(() => {
      searchInputRef.current?.focus();
    }, []),
    
    // Sidebar toggle is handled in Sidebar component itself via Ctrl+B
    
    onSwitch3D: useCallback(() => {
      if (viewMode !== "3d" && viewMode !== "admin") {
        setViewMode("3d");
      }
    }, [viewMode]),
    
    onSwitch2D: useCallback(() => {
      if (viewMode !== "2d" && viewMode !== "admin") {
        setViewMode("2d");
      }
    }, [viewMode]),
    
    onSwitchCommunity: useCallback(() => {
      if (viewMode !== "communities" && viewMode !== "admin") {
        setViewMode("communities");
      }
    }, [viewMode]),
    
    onToggleLabels: useCallback(() => {
      if (viewMode === "3d" || viewMode === "2d") {
        setShowLabels(prev => !prev);
      }
    }, [viewMode]),
    
    onEscape: useCallback(() => {
      // Close help overlay if open
      if (showShortcutsHelp) {
        setShowShortcutsHelp(false);
        return;
      }
      // Otherwise deselect node
      setSelectedId(undefined);
      setFocusNodeId(undefined);
    }, [showShortcutsHelp]),
    
    onShowHelp: useCallback(() => {
      setShowShortcutsHelp(prev => !prev);
    }, []),
    
    // Note: Fit graph, reset camera, and arrow navigation require graph instance methods
    // These will be handled by exposing methods from Graph3D/Graph2D components
    // For now, we'll leave them undefined and implement in a follow-up if needed
  });

  return (
    <div className="w-full h-screen bg-white dark:bg-black transition-colors duration-200">
      {/* Search bar - visible in all views except admin */}
      {viewMode !== "admin" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
          <SearchBar
            ref={searchInputRef}
            onSelectNode={(id) => {
              setFocusNodeId(id);
              setSelectedId(id);
              // Switch to 3D view if not already in a graph view
              if (viewMode === "dashboard") {
                setViewMode("3d");
              }
            }}
          />
        </div>
      )}
      
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
          <Sidebar
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
            sizeAttenuation={sizeAttenuation}
            onToggleSizeAttenuation={(enabled) =>
              setSizeAttenuation(enabled)
            }
            enableAdaptiveLOD={enableAdaptiveLOD}
            onToggleAdaptiveLOD={(enabled) =>
              setEnableAdaptiveLOD(enabled)
            }
            currentLODTier={currentLODTier}
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
                sizeAttenuation={sizeAttenuation}
                enableAdaptiveLOD={enableAdaptiveLOD}
                onLODTierChange={setCurrentLODTier}
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
      
      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp 
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
    </div>
  );
}

export default App;
