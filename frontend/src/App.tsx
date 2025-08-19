import Controls from "./components/Controls.tsx";
import Graph3D from "./components/Graph3D.tsx";
import Inspector from "./components/Inspector.tsx";
import type { TypeFilters } from "./types/ui";
import { useState } from "react";

function App() {
  const [filters, setFilters] = useState<TypeFilters>({
    subreddit: true,
    user: true,
    post: false,
    comment: false,
  });
  const [linkOpacity, setLinkOpacity] = useState(0.4);
  const [nodeRelSize, setNodeRelSize] = useState(6);
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>();
  const [showLabels, setShowLabels] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  return (
    <div className="w-full h-screen">
      <Controls
        filters={filters}
        onFiltersChange={setFilters}
        linkOpacity={linkOpacity}
        onLinkOpacityChange={setLinkOpacity}
        nodeRelSize={nodeRelSize}
        onNodeRelSizeChange={setNodeRelSize}
        onFocusNode={setFocusNodeId}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
      />
      <Graph3D
        filters={filters}
        linkOpacity={linkOpacity}
        nodeRelSize={nodeRelSize}
        focusNodeId={focusNodeId}
        showLabels={showLabels}
        onNodeSelect={(id) => {
          setFocusNodeId(id);
          setSelectedId(id);
        }}
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
    </div>
  );
}

export default App;
