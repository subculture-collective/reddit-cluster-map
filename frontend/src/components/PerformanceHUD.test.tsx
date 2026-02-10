import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PerformanceHUD from './PerformanceHUD';
import * as THREE from 'three';

describe('PerformanceHUD', () => {
    let mockRenderer: THREE.WebGLRenderer;

    beforeEach(() => {
        // Mock localStorage
        const localStorageMock = {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
        };
        Object.defineProperty(window, 'localStorage', {
            value: localStorageMock,
            writable: true,
        });

        // Create a minimal mock renderer
        mockRenderer = {
            info: {
                render: {
                    calls: 5,
                    triangles: 10000,
                    points: 0,
                    lines: 0,
                },
                memory: {
                    textures: 3,
                    geometries: 2,
                },
            },
        } as unknown as THREE.WebGLRenderer;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders without crashing', () => {
        render(<PerformanceHUD renderer={null} />);
        const element = screen.getByLabelText('Performance metrics overlay');
        expect(element).toBeInTheDocument();
    });

    it('is hidden by default', () => {
        render(<PerformanceHUD renderer={mockRenderer} />);
        const element = screen.getByLabelText('Performance metrics overlay');
        expect(element).toHaveStyle({ display: 'none' });
    });

    it('cannot be toggled in production without explicit enable', async () => {
        // Mock production environment
        vi.stubEnv('PROD', true);
        
        render(<PerformanceHUD renderer={mockRenderer} />);
        const element = screen.getByLabelText('Performance metrics overlay');
        
        // Should be hidden
        expect(element).toHaveStyle({ display: 'none' });
        
        // Try to toggle with Ctrl+Shift+P - should not work
        const event = new KeyboardEvent('keydown', {
            key: 'p',
            ctrlKey: true,
            shiftKey: true,
        });
        window.dispatchEvent(event);
        
        // Should still be hidden
        await waitFor(() => {
            expect(element).toHaveStyle({ display: 'none' });
        });
        
        vi.unstubAllEnvs();
    });

    it('accepts all props without error', () => {
        expect(() => {
            render(
                <PerformanceHUD
                    renderer={mockRenderer}
                    nodeCount={1000}
                    totalNodeCount={5000}
                    simulationState="active"
                    lodLevel={2}
                />
            );
        }).not.toThrow();
    });

    it('handles null renderer gracefully', () => {
        expect(() => {
            render(<PerformanceHUD renderer={null} nodeCount={100} />);
        }).not.toThrow();
    });

    it('handles different node counts', () => {
        expect(() => {
            render(
                <PerformanceHUD
                    renderer={mockRenderer}
                    nodeCount={1234}
                    totalNodeCount={5678}
                />
            );
        }).not.toThrow();
    });

    it('handles different simulation states', () => {
        const { rerender } = render(
            <PerformanceHUD renderer={mockRenderer} simulationState="active" />
        );
        expect(() => {
            rerender(<PerformanceHUD renderer={mockRenderer} simulationState="precomputed" />);
        }).not.toThrow();
        expect(() => {
            rerender(<PerformanceHUD renderer={mockRenderer} simulationState="idle" />);
        }).not.toThrow();
    });

    it('handles different LOD levels', () => {
        expect(() => {
            render(<PerformanceHUD renderer={mockRenderer} lodLevel={3} />);
        }).not.toThrow();
    });

    it('uses monospace font and proper styling', () => {
        render(<PerformanceHUD renderer={mockRenderer} />);
        const element = screen.getByLabelText('Performance metrics overlay');
        expect(element).toHaveClass('font-mono');
        expect(element).toHaveClass('text-xs');
        expect(element).toHaveClass('fixed');
        expect(element).toHaveClass('z-50');
    });

    it('toggles visibility with Ctrl+Shift+P (case insensitive)', async () => {
        render(<PerformanceHUD renderer={mockRenderer} />);
        const element = screen.getByLabelText('Performance metrics overlay');
        const initialDisplay = element.style.display;
        
        // Test with lowercase 'p'
        const event = new KeyboardEvent('keydown', {
            key: 'p',
            ctrlKey: true,
            shiftKey: true,
        });
        window.dispatchEvent(event);
        
        await waitFor(() => {
            expect(element.style.display).not.toBe(initialDisplay);
        });
    });
});
