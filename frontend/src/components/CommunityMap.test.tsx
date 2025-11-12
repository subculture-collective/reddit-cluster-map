import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CommunityMap from './CommunityMap';

describe('CommunityMap', () => {
  const mockCommunities = [
    { id: 1, color: '#ff0000', size: 10, topNodes: [], nodes: ['node1', 'node2'] },
    { id: 2, color: '#00ff00', size: 8, topNodes: [], nodes: ['node3'] },
  ];

  const mockNodeCommunities = new Map([
    ['node1', 1],
    ['node2', 1],
    ['node3', 2],
  ]);

  const mockResult = {
    nodeCommunities: mockNodeCommunities,
    communities: mockCommunities,
    modularity: 0.5,
  };

  it('renders without crashing with no communities', () => {
    const { container } = render(<CommunityMap communityResult={null} />);
    expect(container).toBeTruthy();
  });

  it('displays loading or message when no communities detected', () => {
    const { container } = render(<CommunityMap communityResult={null} />);
    // Component should render even without communities
    expect(container.querySelector('.relative')).toBeTruthy();
  });

  it('renders when communities exist', () => {
    const { container } = render(<CommunityMap communityResult={mockResult} />);
    // Component should render with communities data
    expect(container.querySelector('.relative')).toBeTruthy();
  });
});
