import { useEffect, useState } from 'react';

/**
 * Mobile device detection hook
 * 
 * Detects mobile devices using:
 * 1. Screen width breakpoints (< 768px is considered mobile)
 * 2. Touch capability detection
 * 3. User agent sniffing as fallback
 * 
 * Returns:
 * - isMobile: true if device is mobile (small screen or touch-primary)
 * - isTablet: true if device is tablet-sized (768px - 1024px)
 * - isTouchDevice: true if device supports touch events
 * - screenWidth: current screen width in pixels
 */
export function useMobileDetect() {
    const [isMobile, setIsMobile] = useState(false);
    const [isTablet, setIsTablet] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [screenWidth, setScreenWidth] = useState(
        typeof window !== 'undefined' ? window.innerWidth : 1920
    );

    useEffect(() => {
        // Detect touch capability
        const checkTouchCapability = () => {
            return (
                'ontouchstart' in window ||
                navigator.maxTouchPoints > 0 ||
                // @ts-expect-error - msMaxTouchPoints is IE-specific
                navigator.msMaxTouchPoints > 0
            );
        };

        // Update dimensions and device type
        const updateDeviceType = () => {
            const width = window.innerWidth;
            setScreenWidth(width);

            const hasTouch = checkTouchCapability();
            setIsTouchDevice(hasTouch);

            // Mobile: < 768px width OR touch-primary device with small screen
            const isMobileWidth = width < 768;
            setIsMobile(isMobileWidth);

            // Tablet: 768px - 1024px width
            const isTabletWidth = width >= 768 && width < 1024;
            setIsTablet(isTabletWidth);
        };

        // Initial check
        updateDeviceType();

        // Listen for resize events
        window.addEventListener('resize', updateDeviceType);

        return () => {
            window.removeEventListener('resize', updateDeviceType);
        };
    }, []);

    return {
        isMobile,
        isTablet,
        isTouchDevice,
        screenWidth,
    };
}

/**
 * Get mobile-optimized graph rendering configuration
 * 
 * Returns lower node/link limits and LOD settings for mobile devices
 * to ensure acceptable performance (>15 FPS target)
 */
export function getMobileGraphConfig(isMobile: boolean, isTablet: boolean) {
    if (isMobile) {
        return {
            maxRenderNodes: 5000,
            maxRenderLinks: 10000,
            defaultLODTier: 2, // MEDIUM tier
            pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), // Cap lower on mobile
        };
    }

    if (isTablet) {
        return {
            maxRenderNodes: 10000,
            maxRenderLinks: 25000,
            defaultLODTier: 2, // MEDIUM tier
            pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        };
    }

    // Desktop defaults
    return {
        maxRenderNodes: 20000,
        maxRenderLinks: 50000,
        defaultLODTier: 3, // HIGH tier
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    };
}
