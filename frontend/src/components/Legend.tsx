/**
 * Legend component - displays color schemes for node types and communities
 */

import type { TypeFilters } from "../types/ui";

interface Props {
  filters: TypeFilters;
  useCommunityColors?: boolean;
  communityCount?: number;
}

const NODE_TYPE_COLORS = [
  { key: "subreddit", label: "Subreddit", color: "#4ade80" },
  { key: "user", label: "User", color: "#60a5fa" },
  { key: "post", label: "Post", color: "#f59e0b" },
  { key: "comment", label: "Comment", color: "#f43f5e" },
] as const;

export default function Legend({ filters, useCommunityColors, communityCount }: Props) {
  const visibleTypes = NODE_TYPE_COLORS.filter((t) => filters[t.key]);

  return (
    <div className="absolute z-20 bottom-2 left-2 bg-black/70 text-white p-3 rounded shadow">
      <div className="text-xs font-semibold mb-2 text-white/90">Legend</div>
      
      {/* Node Types */}
      {!useCommunityColors && (
        <div className="space-y-1">
          {visibleTypes.map((type) => (
            <div key={type.key} className="flex items-center gap-2 text-xs">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: type.color }}
              />
              <span>{type.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Community Colors */}
      {useCommunityColors && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded bg-gradient-to-r from-red-500 via-blue-500 to-green-500" />
            <span>
              {communityCount ? `${communityCount} communities` : "Communities"}
            </span>
          </div>
          <div className="text-xs text-white/60 mt-1">
            Colors by community detection
          </div>
        </div>
      )}

      {/* Size Legend */}
      <div className="mt-3 pt-2 border-t border-white/20">
        <div className="text-xs text-white/70">
          Node size = degree (connections)
        </div>
      </div>
    </div>
  );
}
