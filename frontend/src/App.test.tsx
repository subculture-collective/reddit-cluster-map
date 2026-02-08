import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock all child components
vi.mock('./components/Admin', () => ({
  default: () => <div>Mocked Admin</div>,
}));

vi.mock('./components/Dashboard', () => ({
  default: () => <div>Mocked Dashboard</div>,
}));

vi.mock('./components/Communities', () => ({
  default: () => <div>Mocked Communities</div>,
}));

vi.mock('./components/Controls', () => ({
  default: () => <div>Mocked Controls</div>,
}));

vi.mock('./components/Graph3D', () => ({
  default: () => <div>Mocked Graph3D</div>,
}));

vi.mock('./components/Graph2D', () => ({
  default: () => <div>Mocked Graph2D</div>,
}));

vi.mock('./components/Inspector', () => ({
  default: () => <div>Mocked Inspector</div>,
}));

vi.mock('./components/Legend', () => ({
  default: () => <div>Mocked Legend</div>,
}));

vi.mock('./components/ShareButton', () => ({
  default: () => <div>Mocked ShareButton</div>,
}));

vi.mock('./components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./components/GraphErrorFallback', () => ({
  default: () => <div>Mocked GraphErrorFallback</div>,
}));

vi.mock('./utils/webglDetect', () => ({
  detectWebGLSupport: () => true,
}));

vi.mock('./utils/urlState', () => ({
  readStateFromURL: () => ({}),
  writeStateToURL: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('renders default 3D view', () => {
    render(<App />);
    expect(screen.getByText('Mocked Graph3D')).toBeInTheDocument();
    expect(screen.getByText('Mocked Controls')).toBeInTheDocument();
    expect(screen.getByText('Mocked Legend')).toBeInTheDocument();
  });

  it('renders main container with correct classes', () => {
    const { container } = render(<App />);
    const mainDiv = container.firstChild as HTMLElement;
    expect(mainDiv).toHaveClass('w-full', 'h-screen');
  });
});
