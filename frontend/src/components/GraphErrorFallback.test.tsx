import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GraphErrorFallback from './GraphErrorFallback';

describe('GraphErrorFallback', () => {
  const mockError = new Error('Test render error');
  const mockOnRetry = vi.fn();
  const mockOnFallbackTo2D = vi.fn();

  it('renders error message for 3D mode', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        mode="3d"
      />
    );

    expect(screen.getByText(/Graph Rendering Failed \(3D\)/)).toBeInTheDocument();
  });

  it('renders error message for 2D mode', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        mode="2d"
      />
    );

    expect(screen.getByText(/Graph Rendering Failed \(2D\)/)).toBeInTheDocument();
  });

  it('shows WebGL not supported message when WebGL is unavailable', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        mode="3d"
        webglSupported={false}
      />
    );

    expect(screen.getByText('WebGL Not Supported')).toBeInTheDocument();
    expect(screen.getByText(/Your browser doesn't support WebGL/)).toBeInTheDocument();
  });

  it('shows WebGL error when error message contains "webgl"', () => {
    const webglError = new Error('WebGL context lost');
    
    render(
      <GraphErrorFallback
        error={webglError}
        onRetry={mockOnRetry}
        mode="3d"
      />
    );

    expect(screen.getByText('WebGL Not Supported')).toBeInTheDocument();
  });

  it('displays technical error details when expanded', async () => {
    const user = userEvent.setup();
    
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        mode="3d"
      />
    );

    const detailsButton = screen.getByText('Show technical details');
    await user.click(detailsButton);

    expect(screen.getByText(/Test render error/)).toBeInTheDocument();
  });

  it('calls onRetry when Try Again button clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        mode="3d"
      />
    );

    const retryButton = screen.getByText('Try Again');
    await user.click(retryButton);

    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('shows Switch to 2D View button in 3D mode', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        onFallbackTo2D={mockOnFallbackTo2D}
        mode="3d"
      />
    );

    expect(screen.getByText('Switch to 2D View')).toBeInTheDocument();
  });

  it('does not show Switch to 2D View button in 2D mode', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        onFallbackTo2D={mockOnFallbackTo2D}
        mode="2d"
      />
    );

    expect(screen.queryByText('Switch to 2D View')).not.toBeInTheDocument();
  });

  it('does not show Switch to 2D View button when callback not provided', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        mode="3d"
      />
    );

    expect(screen.queryByText('Switch to 2D View')).not.toBeInTheDocument();
  });

  it('calls onFallbackTo2D when button clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        onFallbackTo2D={mockOnFallbackTo2D}
        mode="3d"
      />
    );

    const fallbackButton = screen.getByText('Switch to 2D View');
    await user.click(fallbackButton);

    expect(mockOnFallbackTo2D).toHaveBeenCalledTimes(1);
  });

  it('always shows Reload Page button', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        mode="3d"
      />
    );

    expect(screen.getByText('Reload Page')).toBeInTheDocument();
  });

  it('shows browser suggestions for WebGL errors', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        mode="3d"
        webglSupported={false}
      />
    );

    expect(screen.getByText(/Chrome, Firefox, Safari, or Edge/)).toBeInTheDocument();
  });

  it('suggests 2D fallback for WebGL errors in 3D mode', () => {
    render(
      <GraphErrorFallback
        error={mockError}
        onRetry={mockOnRetry}
        onFallbackTo2D={mockOnFallbackTo2D}
        mode="3d"
        webglSupported={false}
      />
    );

    expect(screen.getByText(/switch to the 2D view/)).toBeInTheDocument();
  });

  it('displays error stack when available', async () => {
    const user = userEvent.setup();
    const errorWithStack = new Error('Test error');
    errorWithStack.stack = 'Error: Test error\n    at TestComponent';
    
    render(
      <GraphErrorFallback
        error={errorWithStack}
        onRetry={mockOnRetry}
        mode="3d"
      />
    );

    const detailsButton = screen.getByText('Show technical details');
    await user.click(detailsButton);

    expect(screen.getByText(/at TestComponent/)).toBeInTheDocument();
  });
});
