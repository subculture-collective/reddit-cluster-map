/**
 * Mock graph data for testing
 */

import type { GraphNode, GraphLink, GraphData } from '../types/graph';

export const mockNodes: GraphNode[] = [
  {
    id: 'subreddit_1',
    name: 'AskReddit',
    type: 'subreddit',
    val: 1000,
  },
  {
    id: 'subreddit_2',
    name: 'programming',
    type: 'subreddit',
    val: 500,
  },
  {
    id: 'user_1',
    name: 'john_doe',
    type: 'user',
    val: 100,
  },
  {
    id: 'user_2',
    name: 'jane_smith',
    type: 'user',
    val: 150,
  },
  {
    id: 'post_1',
    name: 'How do I learn React?',
    type: 'post',
    val: 50,
  },
  {
    id: 'comment_1',
    name: 'Great question!',
    type: 'comment',
    val: 20,
  },
];

export const mockLinks: GraphLink[] = [
  {
    source: 'user_1',
    target: 'subreddit_1',
  },
  {
    source: 'user_2',
    target: 'subreddit_2',
  },
  {
    source: 'post_1',
    target: 'subreddit_2',
  },
  {
    source: 'comment_1',
    target: 'post_1',
  },
  {
    source: 'subreddit_1',
    target: 'subreddit_2',
  },
];

export const mockGraphData: GraphData = {
  nodes: mockNodes,
  links: mockLinks,
};

export const mockEmptyGraphData: GraphData = {
  nodes: [],
  links: [],
};

export const mockSmallGraphData: GraphData = {
  nodes: [mockNodes[0], mockNodes[1]],
  links: [mockLinks[4]],
};
