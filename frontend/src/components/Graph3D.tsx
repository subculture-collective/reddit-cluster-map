import { useEffect, useState } from 'react';

import ForceGraph3D from 'react-force-graph-3d';

interface GraphNode {
  id: string;
  name: string;
  val: number;
  type: string;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export default function Graph3D() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8080'}/graph`, {
          signal: controller.signal,
        });
        const data = await response.json();
        setGraphData(data);
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Fetch aborted');
        } else {
          console.error('Error fetching graph data:', error);
        }
      }
    };

    fetchData();

    return () => {
      controller.abort();
    };
  }, []);

  if (!graphData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="w-full h-screen">
      <ForceGraph3D
        graphData={graphData}
        nodeLabel="name"
        nodeColor={node => node.type === 'post' ? '#ff0000' : '#00ff00'}
        nodeRelSize={6}
        linkWidth={1}
        linkColor={() => '#999'}
        backgroundColor="#000000"
      />
    </div>
  );
} 