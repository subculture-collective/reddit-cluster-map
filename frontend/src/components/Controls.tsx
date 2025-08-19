import { useMemo, useState } from "react";

import type { TypeFilters } from "../types/ui";

interface Props {
  filters: TypeFilters;
  onFiltersChange: (f: TypeFilters) => void;
  linkOpacity: number;
  onLinkOpacityChange: (v: number) => void;
  nodeRelSize: number;
  onNodeRelSizeChange: (v: number) => void;
  onFocusNode: (id?: string) => void;
  showLabels?: boolean;
  onShowLabelsChange?: (v: boolean) => void;
}

export default function Controls({
  filters,
  onFiltersChange,
  linkOpacity,
  onLinkOpacityChange,
  nodeRelSize,
  onNodeRelSizeChange,
  onFocusNode,
  showLabels,
  onShowLabelsChange,
}: Props) {
  const [search, setSearch] = useState("");

  const onToggle = (key: keyof TypeFilters) =>
    onFiltersChange({ ...filters, [key]: !filters[key] });

  const info = useMemo(
    () =>
      [
        { key: "subreddit", color: "#4ade80" },
        { key: "user", color: "#60a5fa" },
        { key: "post", color: "#f59e0b" },
        { key: "comment", color: "#f43f5e" },
      ] as const,
    []
  );

  return (
    <div className="absolute z-20 top-2 right-2 bg-black/60 text-white p-3 rounded shadow flex flex-col gap-3">
      <div className="flex gap-2 items-center">
        <input
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearch(e.target.value)
          }
          placeholder="Focus node by id/name"
          className="bg-black/40 border border-white/20 rounded px-2 py-1 text-sm outline-none"
        />
        <button
          className="border border-white/30 rounded px-2 py-1 hover:bg-white/10"
          onClick={() => onFocusNode(search || undefined)}
        >
          Focus
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!showLabels}
          onChange={(e) => onShowLabelsChange?.(e.target.checked)}
        />
        Show labels
      </label>

      <div className="flex gap-3 items-center">
        <label className="text-sm">Link opacity</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={linkOpacity}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onLinkOpacityChange(parseFloat(e.target.value))
          }
        />
      </div>

      <div className="flex gap-3 items-center">
        <label className="text-sm">Node size</label>
        <input
          type="range"
          min={2}
          max={12}
          step={1}
          value={nodeRelSize}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onNodeRelSizeChange(parseInt(e.target.value))
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {info.map((i) => (
          <label key={i.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters[i.key]}
              onChange={() => onToggle(i.key)}
            />
            <span className="inline-flex items-center gap-1">
              <span
                className="w-3 h-3 inline-block rounded"
                style={{ background: i.color }}
              />
              {i.key}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
