import { useEffect, useState } from 'react';

/**
 * Detect touch capability synchronously
 */
function checkTouchCapability(): boolean {
    if (typeof window === 'undefined') return false;
    return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        // @ts-expect-error - msMaxTouchPoints is IE-specific
        navigator.msMaxTouchPoints > 0
    );
}

/**
 * Get initial device type synchronously to avoid first-render flicker
 */
function getInitialDeviceType() {
    if (typeof window === 'undefined') {
        return {
            isMobile: false,
            isTablet: false,
            isTouchDevice: false,
            screenWidth: 1920,
        };
    }

    const width = window.innerWidth;
    const hasTouch = checkTouchCapability();

    return {
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isTouchDevice: hasTouch,
        screenWidth: width,
    };
}

/**
 * Mobile device detection hook
 * 
 * Detects mobile devices using:
 * 1. Screen width breakpoints (< 768px is considered mobile)
 * 2. Touch capability detection via ontouchstart/maxTouchPoints
 * 
 * Returns:
 * - isMobile: true if device width is < 768px
 * - isTablet: true if device width is 768px - 1024px
 * - isTouchDevice: true if device supports touch events
 * - screenWidth: current screen width in pixels
 * 
 * Note: Values are computed synchronously on mount to avoid first-render flicker.
 */
export function useMobileDetect() {
    const [state, setState] = useState(getInitialDeviceType);

    useEffect(() => {
        // Update dimensions and device type
        const updateDeviceType = () => {
            const width = window.innerWidth;
            const hasTouch = checkTouchCapability();

            setState({
                isMobile: width < 768,
                isTablet: width >= 768 && width < 1024,
                isTouchDevice: hasTouch,
                screenWidth: width,
            });
        };

        // Initial check (in case window size changed between mount and effect)
        updateDeviceType();

        // Listen for resize events
        window.addEventListener('resize', updateDeviceType);

        return () => {
            window.removeEventListener('resize', updateDeviceType);
        };
    }, []);

    return state;
}

/**
 * Get mobile-optimized graph rendering configuration
 * 
 * Returns lower node/link limits and LOD settings for mobile devices
 * to ensure acceptable performance (>15 FPS target)
 */
export function getMobileGraphConfig(isMobile: boolean, isTablet: boolean) {
    // Guard against non-browser environments
    const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    if (isMobile) {
        return {
            maxRenderNodes: 5000,
            maxRenderLinks: 10000,
            defaultLODTier: 2, // MEDIUM tier
            pixelRatio: Math.min(devicePixelRatio, 1.5), // Cap lower on mobile
        };
    }

    if (isTablet) {
        return {
            maxRenderNodes: 10000,
            maxRenderLinks: 25000,
            defaultLODTier: 2, // MEDIUM tier
            pixelRatio: Math.min(devicePixelRatio, 2),
        };
    }

    // Desktop defaults
    return {
        maxRenderNodes: 20000,
        maxRenderLinks: 50000,
        defaultLODTier: 3, // HIGH tier
        pixelRatio: Math.min(devicePixelRatio, 2),
    };
}
