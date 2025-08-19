export type TypeFilters = {
  subreddit: boolean;
  user: boolean;
  post: boolean;
  comment: boolean;
};

export interface SelectedInfo {
  id: string;
  name?: string;
  type?: string;
  degree?: number;
  neighbors?: Array<{ id: string; name?: string; type?: string }>;
}

export interface UISettings {
  showLabels: boolean;
  linkOpacity: number;
  nodeRelSize: number;
}
