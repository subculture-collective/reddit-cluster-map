import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Graph2D from './Graph2D';

describe('Graph2D', () => {
  const mockFilters = {
    subreddit: true,
    user: true,
    post: false,
    comment: false,
  };

  const mockPhysics = {
    chargeStrength: -30,
    linkDistance: 30,
    velocityDecay: 0.4,
    cooldownTicks: 100,
    collisionRadius: 0,
  };

  it('renders without crashing', () => {
    const { container } = render(
      <Graph2D
        filters={mockFilters}
        linkOpacity={0.5}
        nodeRelSize={4}
        physics={mockPhysics}
        subredditSize="subscribers"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders graph container', () => {
    const { container } = render(
      <Graph2D
        filters={mockFilters}
        linkOpacity={0.5}
        nodeRelSize={4}
        physics={mockPhysics}
        subredditSize="subscribers"
      />
    );
    // Graph2D renders a div container that will eventually have a canvas
    expect(container.querySelector('div')).toBeInTheDocument();
  });

  it('accepts precomputed layout option', () => {
    const { container } = render(
      <Graph2D
        filters={mockFilters}
        linkOpacity={0.5}
        nodeRelSize={4}
        physics={mockPhysics}
        subredditSize="subscribers"
        usePrecomputedLayout={true}
      />
    );
    expect(container).toBeTruthy();
  });

  it('accepts initial camera position', () => {
    const { container } = render(
      <Graph2D
        filters={mockFilters}
        linkOpacity={0.5}
        nodeRelSize={4}
        physics={mockPhysics}
        subredditSize="subscribers"
        initialCamera={{ x: 100, y: 100, zoom: 1.5 }}
      />
    );
    expect(container).toBeTruthy();
  });
});
