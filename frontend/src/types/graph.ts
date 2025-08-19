export interface GraphNode {
  id: string;
  name: string;
  val?: number;
  type?: "subreddit" | "user" | "post" | "comment" | string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
