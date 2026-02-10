import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithTheme } from '../test/utils';
import Graph3D from './Graph3D';

// Disable instanced renderer for tests (WebGL not available in test environment)
beforeEach(() => {
  import.meta.env.VITE_USE_INSTANCED_RENDERER = false;
});

// Mock webglDetect to return true in tests
vi.mock('../utils/webglDetect', () => ({
  detectWebGLSupport: () => true,
}));

// Mock react-force-graph-3d
vi.mock('react-force-graph-3d', () => ({
  default: () => <div data-testid="force-graph-3d">Mocked ForceGraph3D</div>,
}));

// Mock three-spritetext
vi.mock('three-spritetext', () => ({
  default: class SpriteText {},
}));

describe('Graph3D', () => {
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
    const { container } = renderWithTheme(
      <Graph3D
        filters={mockFilters}
        linkOpacity={0.5}
        nodeRelSize={4}
        physics={mockPhysics}
        subredditSize="subscribers"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders the mocked ForceGraph3D component', async () => {
    // Mock fetch to resolve with minimal graph data
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ nodes: [], links: [] }),
      } as Response)
    );

    const { findByTestId, queryByText } = renderWithTheme(
      <Graph3D
        filters={mockFilters}
        linkOpacity={0.5}
        nodeRelSize={4}
        physics={mockPhysics}
        subredditSize="subscribers"
      />
    );
    
    // Initially shows loading skeleton
    expect(queryByText('Loading Graph')).toBeTruthy();
    
    // After fetch completes, should show ForceGraph3D
    const forceGraph = await findByTestId('force-graph-3d');
    expect(forceGraph).toBeTruthy();
  });

  it('accepts optional props', () => {
    const onNodeSelect = vi.fn();
    const { container } = renderWithTheme(
      <Graph3D
        filters={mockFilters}
        linkOpacity={0.5}
        nodeRelSize={4}
        physics={mockPhysics}
        subredditSize="subscribers"
        minDegree={1}
        maxDegree={100}
        showLabels={true}
        selectedId="test-node"
        onNodeSelect={onNodeSelect}
      />
    );
    expect(container).toBeTruthy();
  });
});
