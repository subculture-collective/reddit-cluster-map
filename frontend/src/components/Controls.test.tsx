import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Controls from './Controls';

describe('Controls', () => {
  const mockFilters = {
    subreddit: true,
    user: true,
    post: false,
    comment: false,
  };

  const mockPhysics = {
    chargeStrength: -220,
    linkDistance: 120,
    velocityDecay: 0.88,
    cooldownTicks: 80,
    collisionRadius: 3,
  };

  const defaultProps = {
    filters: mockFilters,
    onFiltersChange: vi.fn(),
    linkOpacity: 0.35,
    onLinkOpacityChange: vi.fn(),
    nodeRelSize: 5,
    onNodeRelSizeChange: vi.fn(),
    physics: mockPhysics,
    onPhysicsChange: vi.fn(),
    subredditSize: 'subscribers' as const,
    onSubredditSizeChange: vi.fn(),
    onFocusNode: vi.fn(),
  };

  beforeEach(() => {
    // Mock fetch for admin services
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ crawler_enabled: true, precalc_enabled: true }),
      } as Response)
    );
  });

  it('renders view mode buttons', () => {
    render(<Controls {...defaultProps} graphMode="3d" onGraphModeChange={vi.fn()} />);
    
    expect(screen.getByText('3D')).toBeInTheDocument();
    expect(screen.getByText('2D')).toBeInTheDocument();
  });

  it('renders dashboard button', () => {
    render(<Controls {...defaultProps} onShowDashboard={vi.fn()} />);
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders communities button', () => {
    render(<Controls {...defaultProps} onShowCommunities={vi.fn()} />);
    
    expect(screen.getByText('Communities')).toBeInTheDocument();
  });

  it('renders admin button', () => {
    render(<Controls {...defaultProps} onShowAdmin={vi.fn()} />);
    
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument();
  });

  it('calls onGraphModeChange when 3D button clicked', async () => {
    const user = userEvent.setup();
    const onGraphModeChange = vi.fn();
    
    render(<Controls {...defaultProps} graphMode="2d" onGraphModeChange={onGraphModeChange} />);
    
    const button3D = screen.getByText('3D');
    await user.click(button3D);
    
    expect(onGraphModeChange).toHaveBeenCalledWith('3d');
  });

  it('calls onGraphModeChange when 2D button clicked', async () => {
    const user = userEvent.setup();
    const onGraphModeChange = vi.fn();
    
    render(<Controls {...defaultProps} graphMode="3d" onGraphModeChange={onGraphModeChange} />);
    
    const button2D = screen.getByText('2D');
    await user.click(button2D);
    
    expect(onGraphModeChange).toHaveBeenCalledWith('2d');
  });

  it('calls onShowDashboard when Dashboard button clicked', async () => {
    const user = userEvent.setup();
    const onShowDashboard = vi.fn();
    
    render(<Controls {...defaultProps} onShowDashboard={onShowDashboard} />);
    
    const button = screen.getByText('Dashboard');
    await user.click(button);
    
    expect(onShowDashboard).toHaveBeenCalled();
  });

  it('calls onShowCommunities when Communities button clicked', async () => {
    const user = userEvent.setup();
    const onShowCommunities = vi.fn();
    
    render(<Controls {...defaultProps} onShowCommunities={onShowCommunities} />);
    
    const button = screen.getByText('Communities');
    await user.click(button);
    
    expect(onShowCommunities).toHaveBeenCalled();
  });

  it('calls onShowAdmin when Admin button clicked', async () => {
    const user = userEvent.setup();
    const onShowAdmin = vi.fn();
    
    render(<Controls {...defaultProps} onShowAdmin={onShowAdmin} />);
    
    const button = screen.getByRole('button', { name: 'Admin' });
    await user.click(button);
    
    expect(onShowAdmin).toHaveBeenCalled();
  });

  it('highlights active view mode', () => {
    render(<Controls {...defaultProps} graphMode="3d" onGraphModeChange={vi.fn()} />);
    
    const button3D = screen.getByText('3D');
    expect(button3D).toHaveClass('bg-blue-600');
  });

  it('shows community colors toggle when callback provided', () => {
    render(
      <Controls
        {...defaultProps}
        useCommunityColors={false}
        onToggleCommunityColors={vi.fn()}
      />
    );
    
    expect(screen.getByText('Use community colors')).toBeInTheDocument();
  });

  it('shows precomputed layout toggle when callback provided', () => {
    render(
      <Controls
        {...defaultProps}
        usePrecomputedLayout={true}
        onTogglePrecomputedLayout={vi.fn()}
      />
    );
    
    expect(screen.getByText('Use precomputed layout')).toBeInTheDocument();
  });

  it('calls onToggleCommunityColors when checkbox changed', async () => {
    const user = userEvent.setup();
    const onToggleCommunityColors = vi.fn();
    
    render(
      <Controls
        {...defaultProps}
        useCommunityColors={false}
        onToggleCommunityColors={onToggleCommunityColors}
      />
    );
    
    const checkbox = screen.getByRole('checkbox', { name: /community colors/i });
    await user.click(checkbox);
    
    expect(onToggleCommunityColors).toHaveBeenCalledWith(true);
  });

  it('calls onTogglePrecomputedLayout when checkbox changed', async () => {
    const user = userEvent.setup();
    const onTogglePrecomputedLayout = vi.fn();
    
    render(
      <Controls
        {...defaultProps}
        usePrecomputedLayout={true}
        onTogglePrecomputedLayout={onTogglePrecomputedLayout}
      />
    );
    
    const checkbox = screen.getByRole('checkbox', { name: /precomputed layout/i });
    await user.click(checkbox);
    
    expect(onTogglePrecomputedLayout).toHaveBeenCalledWith(false);
  });

  it('renders without optional props', () => {
    const { container } = render(<Controls {...defaultProps} />);
    expect(container).toBeTruthy();
  });
});
