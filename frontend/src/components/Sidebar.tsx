import { useEffect, useState, useCallback } from "react";
import SidebarSection from "./SidebarSection";
import type { TypeFilters } from "../types/ui";

type Physics = {
  chargeStrength: number;
  linkDistance: number;
  velocityDecay: number;
  cooldownTicks: number;
  collisionRadius: number;
  autoTune?: boolean;
};

type SubredditSize =
  | "subscribers"
  | "activeUsers"
  | "contentActivity"
  | "interSubLinks";

interface Props {
  filters: TypeFilters;
  onFiltersChange: (f: TypeFilters) => void;
  minDegree?: number;
  onMinDegreeChange?: (v: number | undefined) => void;
  maxDegree?: number;
  onMaxDegreeChange?: (v: number | undefined) => void;
  linkOpacity: number;
  onLinkOpacityChange: (v: number) => void;
  nodeRelSize: number;
  onNodeRelSizeChange: (v: number) => void;
  physics: Physics;
  onPhysicsChange: (p: Physics) => void;
  subredditSize: SubredditSize;
  onSubredditSizeChange: (m: SubredditSize) => void;
  onFocusNode: (id?: string) => void;
  showLabels?: boolean;
  onShowLabelsChange?: (v: boolean) => void;
  graphMode?: "3d" | "2d";
  onGraphModeChange?: (m: "3d" | "2d") => void;
  onShowDashboard?: () => void;
  onShowCommunities?: () => void;
  onShowAdmin?: () => void;
  useCommunityColors?: boolean;
  onToggleCommunityColors?: (enabled: boolean) => void;
  usePrecomputedLayout?: boolean;
  onTogglePrecomputedLayout?: (enabled: boolean) => void;
  sizeAttenuation?: boolean;
  onToggleSizeAttenuation?: (enabled: boolean) => void;
  enableAdaptiveLOD?: boolean;
  onToggleAdaptiveLOD?: (enabled: boolean) => void;
  currentLODTier?: number;
}

export default function Sidebar(props: Props) {
  const {
    filters,
    onFiltersChange,
    minDegree,
    onMinDegreeChange,
    maxDegree,
    onMaxDegreeChange,
    linkOpacity,
    onLinkOpacityChange,
    nodeRelSize,
    onNodeRelSizeChange,
    physics,
    onPhysicsChange,
    subredditSize,
    onSubredditSizeChange,
    onFocusNode,
    showLabels,
    onShowLabelsChange,
    graphMode,
    onGraphModeChange,
    onShowDashboard,
    onShowCommunities,
    onShowAdmin,
    useCommunityColors,
    onToggleCommunityColors,
    usePrecomputedLayout,
    onTogglePrecomputedLayout,
    sizeAttenuation,
    onToggleSizeAttenuation,
    enableAdaptiveLOD,
    onToggleAdaptiveLOD,
    currentLODTier,
  } = props;

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebar-collapsed");
      return saved === "true";
    } catch {
      return false;
    }
  });

  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("sidebar-collapsed", String(isCollapsed));
    } catch {
      // Ignore localStorage errors
    }
  }, [isCollapsed]);

  // Keyboard shortcut: Ctrl+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contentEditable element
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setIsCollapsed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Note: Admin service status fetching removed from sidebar as it requires authentication.
  // This functionality should remain in the Admin component where proper auth is handled.



  const onToggle = useCallback(
    (key: keyof TypeFilters) =>
      onFiltersChange({ ...filters, [key]: !filters[key] }),
    [filters, onFiltersChange]
  );

  const typeInfo = [
    { key: "subreddit" as const, color: "#4ade80", icon: "🔷" },
    { key: "user" as const, color: "#60a5fa", icon: "👤" },
    { key: "post" as const, color: "#f59e0b", icon: "📝" },
    { key: "comment" as const, color: "#f43f5e", icon: "💬" },
  ];

  return (
    <>
      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full bg-black/90 backdrop-blur-sm text-white z-30 transition-all duration-200 flex flex-col shadow-2xl ${
          isCollapsed ? "w-14" : "w-80 sm:w-80"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          {!isCollapsed && (
            <h2 className="text-sm font-semibold">Controls</h2>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-white/10 rounded transition-colors ml-auto"
            title={isCollapsed ? "Expand (Ctrl+B)" : "Collapse (Ctrl+B)"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={`w-5 h-5 transition-transform ${
                isCollapsed ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {/* Collapsed icon bar */}
        {isCollapsed && (
          <div className="flex flex-col items-center gap-4 py-4">
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title="View section"
              aria-label="Expand View section"
            >
              👁️
            </button>
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title="Filters section"
              aria-label="Expand Filters section"
            >
              🔍
            </button>
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title="Physics section"
              aria-label="Expand Physics section"
            >
              ⚡
            </button>
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title="Display section"
              aria-label="Expand Display section"
            >
              🎨
            </button>
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title="Data section"
              aria-label="Expand Data section"
            >
              📊
            </button>
          </div>
        )}

        {/* Expanded content */}
        {!isCollapsed && (
          <div className="flex-1 overflow-y-auto">
            {/* View Section */}
            <SidebarSection
              title="View"
              icon="👁️"
              storageKey="sidebar-section-view"
            >
              <div className="flex flex-wrap gap-2">
                <button
                  className={`px-3 py-1.5 rounded border text-xs font-medium ${
                    graphMode === "3d"
                      ? "bg-blue-600 border-blue-400"
                      : "bg-gray-700 border-gray-500"
                  }`}
                  onClick={() => onGraphModeChange?.("3d")}
                >
                  3D
                </button>
                <button
                  className={`px-3 py-1.5 rounded border text-xs font-medium ${
                    graphMode === "2d"
                      ? "bg-blue-600 border-blue-400"
                      : "bg-gray-700 border-gray-500"
                  }`}
                  onClick={() => onGraphModeChange?.("2d")}
                >
                  2D
                </button>
                <button
                  className="px-3 py-1.5 rounded border bg-purple-600 border-purple-400 hover:bg-purple-700 text-xs font-medium"
                  onClick={() => onShowDashboard?.()}
                >
                  Dashboard
                </button>
                <button
                  className="px-3 py-1.5 rounded border bg-green-600 border-green-400 hover:bg-green-700 text-xs font-medium"
                  onClick={() => onShowCommunities?.()}
                >
                  Communities
                </button>
                <button
                  className="px-3 py-1.5 rounded border bg-red-600 border-red-400 hover:bg-red-700 text-xs font-medium"
                  onClick={() => onShowAdmin?.()}
                >
                  Admin
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  value={search}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearch(e.target.value)
                  }
                  placeholder="Focus node by id/name"
                  className="flex-1 bg-black/40 border border-white/20 rounded px-2 py-1.5 text-xs outline-none"
                />
                <button
                  className="border border-white/30 rounded px-2 py-1.5 hover:bg-white/10 text-xs"
                  onClick={() => onFocusNode(search || undefined)}
                >
                  Focus
                </button>
              </div>
            </SidebarSection>

            {/* Filters Section */}
            <SidebarSection
              title="Filters"
              icon="🔍"
              storageKey="sidebar-section-filters"
            >
              <div className="grid grid-cols-2 gap-2 text-sm">
                {typeInfo.map((i) => (
                  <label key={i.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={filters[i.key]}
                      onChange={() => onToggle(i.key)}
                    />
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span
                        className="w-3 h-3 inline-block rounded"
                        style={{ background: i.color }}
                      />
                      {i.key}
                    </span>
                  </label>
                ))}
              </div>
              {onMinDegreeChange && (
                <div className="flex gap-2 items-center">
                  <label className="text-xs whitespace-nowrap">Min degree</label>
                  <input
                    type="number"
                    min={0}
                    value={minDegree ?? ""}
                    placeholder="None"
                    className="flex-1 bg-black/40 border border-white/20 rounded px-2 py-1 text-xs outline-none"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      onMinDegreeChange(
                        val === "" ? undefined : parseInt(val, 10) || 0
                      );
                    }}
                  />
                </div>
              )}
              {onMaxDegreeChange && (
                <div className="flex gap-2 items-center">
                  <label className="text-xs whitespace-nowrap">Max degree</label>
                  <input
                    type="number"
                    min={0}
                    value={maxDegree ?? ""}
                    placeholder="None"
                    className="flex-1 bg-black/40 border border-white/20 rounded px-2 py-1 text-xs outline-none"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      onMaxDegreeChange(
                        val === "" ? undefined : parseInt(val, 10) || 0
                      );
                    }}
                  />
                </div>
              )}
            </SidebarSection>

            {/* Physics Section */}
            <SidebarSection
              title="Physics"
              icon="⚡"
              storageKey="sidebar-section-physics"
            >
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!physics.autoTune}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onPhysicsChange({
                      ...physics,
                      autoTune: e.target.checked,
                    })
                  }
                />
                Auto-tune
                <span className="text-xs opacity-60">(3D instanced only)</span>
              </label>

              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <label className="text-xs w-20">Repulsion</label>
                  <input
                    type="range"
                    min={-400}
                    max={0}
                    step={5}
                    value={physics.chargeStrength}
                    className="flex-1"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onPhysicsChange({
                        ...physics,
                        chargeStrength: parseInt(e.target.value),
                      })
                    }
                  />
                  <span className="text-xs opacity-70 w-12 text-right">
                    {physics.chargeStrength}
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <label className="text-xs w-20">Link dist</label>
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={5}
                    value={physics.linkDistance}
                    className="flex-1"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onPhysicsChange({
                        ...physics,
                        linkDistance: parseInt(e.target.value),
                      })
                    }
                  />
                  <span className="text-xs opacity-70 w-12 text-right">
                    {physics.linkDistance}
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <label className="text-xs w-20">Damping</label>
                  <input
                    type="range"
                    min={0.7}
                    max={0.99}
                    step={0.01}
                    value={physics.velocityDecay}
                    className="flex-1"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onPhysicsChange({
                        ...physics,
                        velocityDecay: parseFloat(e.target.value),
                      })
                    }
                  />
                  <span className="text-xs opacity-70 w-12 text-right">
                    {physics.velocityDecay.toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <label className="text-xs w-20">Cooldown</label>
                  <input
                    type="range"
                    min={0}
                    max={400}
                    step={10}
                    value={physics.cooldownTicks}
                    className="flex-1"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onPhysicsChange({
                        ...physics,
                        cooldownTicks: parseInt(e.target.value),
                      })
                    }
                  />
                  <span className="text-xs opacity-70 w-12 text-right">
                    {physics.cooldownTicks}
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <label className="text-xs w-20">Collision</label>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={0.5}
                    value={physics.collisionRadius}
                    className="flex-1"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onPhysicsChange({
                        ...physics,
                        collisionRadius: parseFloat(e.target.value),
                      })
                    }
                  />
                  <span className="text-xs opacity-70 w-12 text-right">
                    {physics.collisionRadius.toFixed(1)}
                  </span>
                </div>
              </div>
            </SidebarSection>

            {/* Display Section */}
            <SidebarSection
              title="Display"
              icon="🎨"
              storageKey="sidebar-section-display"
            >
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!showLabels}
                  onChange={(e) => onShowLabelsChange?.(e.target.checked)}
                />
                Show labels
              </label>

              {onToggleCommunityColors && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!useCommunityColors}
                    onChange={(e) => onToggleCommunityColors?.(e.target.checked)}
                  />
                  Use community colors
                </label>
              )}

              {onTogglePrecomputedLayout && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!usePrecomputedLayout}
                    onChange={(e) =>
                      onTogglePrecomputedLayout?.(e.target.checked)
                    }
                  />
                  Use precomputed layout
                </label>
              )}

              {onToggleSizeAttenuation && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!sizeAttenuation}
                    onChange={(e) => onToggleSizeAttenuation?.(e.target.checked)}
                  />
                  Distance-based node sizing
                </label>
              )}

              {onToggleAdaptiveLOD && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!enableAdaptiveLOD}
                      onChange={(e) => onToggleAdaptiveLOD?.(e.target.checked)}
                    />
                    Adaptive LOD
                  </label>
                  {currentLODTier !== undefined && (
                    <div className="text-xs text-white/60 ml-5">
                      Tier:{" "}
                      {currentLODTier === 0
                        ? "Emergency"
                        : currentLODTier === 1
                        ? "Low"
                        : currentLODTier === 2
                        ? "Medium"
                        : currentLODTier === 3
                        ? "High"
                        : "Unknown"}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <label className="text-xs w-24">Link opacity</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={linkOpacity}
                    className="flex-1"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onLinkOpacityChange(parseFloat(e.target.value))
                    }
                  />
                  <span className="text-xs opacity-70 w-12 text-right">
                    {linkOpacity.toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <label className="text-xs w-24">Node size</label>
                  <input
                    type="range"
                    min={2}
                    max={12}
                    step={1}
                    value={nodeRelSize}
                    className="flex-1"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onNodeRelSizeChange(parseInt(e.target.value))
                    }
                  />
                  <span className="text-xs opacity-70 w-12 text-right">
                    {nodeRelSize}
                  </span>
                </div>
              </div>
            </SidebarSection>

            {/* Data Section */}
            <SidebarSection
              title="Data"
              icon="📊"
              storageKey="sidebar-section-data"
            >
              <div className="flex gap-2 items-center">
                <label className="text-xs whitespace-nowrap">
                  Subreddit size
                </label>
                <select
                  className="flex-1 bg-black/40 border border-white/20 rounded px-2 py-1 text-xs outline-none"
                  value={subredditSize}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    onSubredditSizeChange(e.target.value as SubredditSize)
                  }
                >
                  <option value="subscribers">Subscribers</option>
                  <option value="activeUsers">Active users</option>
                  <option value="contentActivity">Posts + comments</option>
                  <option value="interSubLinks">Inter-sub links</option>
                </select>
              </div>
            </SidebarSection>
          </div>
        )}
      </div>

      {/* Spacer to push content right when sidebar is expanded */}
      <div
        className={`hidden sm:block transition-all duration-200 ${
          isCollapsed ? "w-14" : "w-80"
        }`}
      />
    </>
  );
}
