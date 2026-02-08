import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSkeleton from './LoadingSkeleton';

describe('LoadingSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container).toBeTruthy();
  });

  it('displays loading message', () => {
    render(<LoadingSkeleton />);
    expect(screen.getByText('Loading Graph')).toBeInTheDocument();
  });

  it('displays preparing message', () => {
    render(<LoadingSkeleton />);
    expect(screen.getByText('Preparing network visualization...')).toBeInTheDocument();
  });

  it('renders skeleton nodes', () => {
    const { container } = render(<LoadingSkeleton />);
    // Check for pulsing circles (skeleton nodes)
    const circles = container.querySelectorAll('.rounded-full');
    expect(circles.length).toBeGreaterThan(0);
  });

  it('renders SVG skeleton links', () => {
    const { container } = render(<LoadingSkeleton />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('applies animations', () => {
    const { container } = render(<LoadingSkeleton />);
    const animatedElements = container.querySelectorAll('.animate-pulse, .animate-spin, .animate-bounce');
    expect(animatedElements.length).toBeGreaterThan(0);
  });
});
