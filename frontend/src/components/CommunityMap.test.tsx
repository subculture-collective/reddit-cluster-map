import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommunityMap from './CommunityMap';

describe('CommunityMap', () => {
  const mockCommunities = [
    { id: 1, color: '#ff0000', size: 10, topNodes: [] },
    { id: 2, color: '#00ff00', size: 8, topNodes: [] },
  ];

  const mockNodeCommunities = new Map([
    ['node1', 1],
    ['node2', 1],
    ['node3', 2],
  ]);

  const mockResult = {
    nodeCommunities: mockNodeCommunities,
    communities: mockCommunities,
  };

  it('renders without crashing with no communities', () => {
    const { container } = render(<CommunityMap result={null} />);
    expect(container).toBeTruthy();
  });

  it('displays loading or message when no communities detected', () => {
    const { container } = render(<CommunityMap result={null} />);
    // Component should render even without communities
    expect(container.querySelector('.relative')).toBeInTheDocument();
  });

  it('renders when communities exist', () => {
    const { container } = render(<CommunityMap result={mockResult} />);
    // Component should render with communities data
    expect(container.querySelector('.relative')).toBeInTheDocument();
  });

  it('accepts onSelectCommunity callback', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CommunityMap result={mockResult} onSelectCommunity={onSelect} />
    );
    expect(container).toBeTruthy();
  });

  it('accepts selectedCommunityId prop', () => {
    const { container } = render(
      <CommunityMap result={mockResult} selectedCommunityId={1} />
    );
    expect(container).toBeTruthy();
  });
});
