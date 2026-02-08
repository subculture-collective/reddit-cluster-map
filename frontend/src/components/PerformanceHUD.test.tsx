import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PerformanceHUD from './PerformanceHUD';
import * as THREE from 'three';

describe('PerformanceHUD', () => {
    let mockRenderer: THREE.WebGLRenderer;

    beforeEach(() => {
        // Mock localStorage
        const localStorageMock = {
            getItem: vi.fn(),
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
        // Component should render but be hidden by default
        const element = screen.getByLabelText('Performance metrics overlay');
        expect(element).toBeInTheDocument();
    });

    it('is hidden by default in production', () => {
        // Mock production environment
        vi.stubEnv('PROD', true);
        
        render(<PerformanceHUD renderer={mockRenderer} />);
        
        const element = screen.getByLabelText('Performance metrics overlay');
        expect(element).toHaveStyle({ display: 'none' });
        
        vi.unstubAllEnvs();
    });

    it('displays performance metrics when visible', async () => {
        render(
            <PerformanceHUD
                renderer={mockRenderer}
                nodeCount={1000}
                totalNodeCount={5000}
                simulationState="active"
                lodLevel={2}
            />
        );

        const element = screen.getByLabelText('Performance metrics overlay');
        
        // Wait for initial update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Should contain key metrics in the text content
        expect(element.textContent).toContain('FPS:');
        expect(element.textContent).toContain('Draw Calls:');
        expect(element.textContent).toContain('Nodes:');
        expect(element.textContent).toContain('GPU Mem:');
        expect(element.textContent).toContain('LOD:');
        expect(element.textContent).toContain('Simulation:');
    });

    it('shows draw call information from renderer', async () => {
        render(
            <PerformanceHUD
                renderer={mockRenderer}
                nodeCount={100}
            />
        );

        const element = screen.getByLabelText('Performance metrics overlay');
        
        // Wait for initial update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Should show draw calls from mock renderer
        expect(element.textContent).toContain('Draw Calls: 5');
    });

    it('handles null renderer gracefully', async () => {
        render(
            <PerformanceHUD
                renderer={null}
                nodeCount={100}
            />
        );

        const element = screen.getByLabelText('Performance metrics overlay');
        
        // Wait for initial update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Should show 0 for metrics when renderer is null
        expect(element.textContent).toContain('Draw Calls: 0');
    });

    it('displays node count correctly', async () => {
        render(
            <PerformanceHUD
                renderer={mockRenderer}
                nodeCount={1234}
                totalNodeCount={5678}
            />
        );

        const element = screen.getByLabelText('Performance metrics overlay');
        
        // Wait for initial update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Should show visible/total node counts
        expect(element.textContent).toMatch(/Nodes: 1,234 \/ 5,678/);
    });

    it('displays simulation state correctly', async () => {
        const { rerender } = render(
            <PerformanceHUD
                renderer={mockRenderer}
                simulationState="active"
            />
        );

        let element = screen.getByLabelText('Performance metrics overlay');
        
        // Wait for initial update
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(element.textContent).toContain('Simulation: active');

        // Test different states
        rerender(
            <PerformanceHUD
                renderer={mockRenderer}
                simulationState="precomputed"
            />
        );
        
        await new Promise(resolve => setTimeout(resolve, 100));
        element = screen.getByLabelText('Performance metrics overlay');
        expect(element.textContent).toContain('Simulation: precomputed');
    });

    it('displays LOD level correctly', async () => {
        render(
            <PerformanceHUD
                renderer={mockRenderer}
                lodLevel={3}
            />
        );

        const element = screen.getByLabelText('Performance metrics overlay');
        
        // Wait for initial update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(element.textContent).toContain('LOD: 3');
    });

    it('uses monospace font and proper styling', () => {
        render(<PerformanceHUD renderer={mockRenderer} />);
        
        const element = screen.getByLabelText('Performance metrics overlay');
        
        expect(element).toHaveClass('font-mono');
        expect(element).toHaveClass('text-xs');
        expect(element).toHaveClass('fixed');
        expect(element).toHaveClass('z-50');
    });

    it('toggles visibility with F12 key', async () => {
        render(<PerformanceHUD renderer={mockRenderer} />);
        
        const element = screen.getByLabelText('Performance metrics overlay');
        const initialDisplay = element.style.display;
        
        // Simulate F12 key press
        const event = new KeyboardEvent('keydown', { key: 'F12' });
        window.dispatchEvent(event);
        
        // Wait a tick for the event to process
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Display should toggle
        expect(element.style.display).not.toBe(initialDisplay);
    });

    it('toggles visibility with Ctrl+Shift+P', async () => {
        render(<PerformanceHUD renderer={mockRenderer} />);
        
        const element = screen.getByLabelText('Performance metrics overlay');
        const initialDisplay = element.style.display;
        
        // Simulate Ctrl+Shift+P
        const event = new KeyboardEvent('keydown', {
            key: 'P',
            ctrlKey: true,
            shiftKey: true,
        });
        window.dispatchEvent(event);
        
        // Wait a tick for the event to process
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Display should toggle
        expect(element.style.display).not.toBe(initialDisplay);
    });
});
