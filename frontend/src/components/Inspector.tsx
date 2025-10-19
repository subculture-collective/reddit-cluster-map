import type { SelectedInfo } from "../types/ui";
import VirtualList from "./VirtualList";

interface Props {
  selected?: SelectedInfo;
  onClear: () => void;
  onFocus: (id: string) => void;
}

export default function Inspector({ selected, onClear, onFocus }: Props) {
  if (!selected) return null;
  // Only show inspector when the selected node has at least one connection
  const hasConnections =
    (typeof selected.degree === "number" && selected.degree > 0) ||
    (selected.neighbors && selected.neighbors.length > 0);
  if (!hasConnections) return null;
  return (
    <div className="absolute z-20 bottom-2 left-2 bg-black/70 text-white p-3 rounded shadow max-w-md">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-sm">Selection</h3>
        <button
          className="text-xs opacity-75 hover:opacity-100"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div className="text-sm space-y-1">
        <div>
          <span className="opacity-70">ID:</span> {selected.id}
        </div>
        {selected.name && (
          <div>
            <span className="opacity-70">Name:</span> {selected.name}
          </div>
        )}
        {selected.type && (
          <div>
            <span className="opacity-70">Type:</span> {selected.type}
          </div>
        )}
        {typeof selected.degree === "number" && (
          <div>
            <span className="opacity-70">Degree:</span> {selected.degree}
          </div>
        )}
        {selected.neighbors && selected.neighbors.length > 0 && (
          <div className="mt-2">
            <div className="opacity-70">Neighbors ({selected.neighbors.length}):</div>
            <VirtualList
              items={selected.neighbors}
              itemHeight={28}
              containerHeight={160}
              className="pr-1"
              renderItem={(n) => (
                <button
                  className="text-left w-full hover:underline text-sm py-1"
                  onClick={() => onFocus(n.id)}
                  title={n.id}
                >
                  {n.name || n.id} {n.type ? `(${n.type})` : ""}
                </button>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
