export type TypeFilters = {
  subreddit: boolean;
  user: boolean;
  post: boolean;
  comment: boolean;
};

export interface NeighborInfo {
  id: string;
  name: string;
  val: string;
  type?: string;
  degree: number;
}

export interface NodeStats {
  // Subreddit-specific fields
  subscribers?: number;
  title?: string;
  description?: string;
}

export interface SelectedInfo {
  id: string;
  name?: string;
  type?: string;
  degree?: number;
  neighbors?: Array<{ id: string; name?: string; type?: string }>;
}

export interface NodeDetails extends SelectedInfo {
  val?: string;
  pos_x?: number;
  pos_y?: number;
  pos_z?: number;
  neighbors: NeighborInfo[];
  stats?: NodeStats;
}

export interface UISettings {
  showLabels: boolean;
  linkOpacity: number;
  nodeRelSize: number;
}
