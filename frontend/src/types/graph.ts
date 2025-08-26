export interface GraphNode {
    id: string;
    name: string;
    val?: number;
    type?: 'subreddit' | 'user' | 'post' | 'comment' | string;
    // Optional precomputed layout positions (when provided by backend)
    x?: number;
    y?: number;
    z?: number;
}

export interface GraphLink {
    source: string;
    target: string;
}

export interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}
