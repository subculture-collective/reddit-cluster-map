/**
 * Visual Regression Tests for Graph Rendering
 * 
 * Tests screenshot consistency across:
 * - Different graph sizes (empty, small, large)
 * - Different view modes (3D, 2D)
 * - Different themes (light, dark)
 * - Zoomed states
 * 
 * Run with: npm run test:visual
 * Update baselines with: npm run test:visual:update
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to load fixture data
function loadFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, 'fixtures', `visual-${fixtureName}.json`);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
}

// Helper to mock the API response with fixture data
async function mockGraphAPI(page: Page, fixtureName: string) {
  const fixtureData = loadFixture(fixtureName);
  
  await page.route('**/api/graph*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtureData),
    });
  });
}

// Helper to wait for graph to be rendered and stable
async function waitForGraphStable(page: Page, timeout: number = 5000) {
  // Wait for either 3D or 2D graph container to be visible
  try {
    await page.waitForSelector('canvas, svg', { timeout: 10000 });
  } catch {
    // If no canvas/svg found, might be empty graph state
    console.log('No graph canvas/svg found - might be empty graph');
  }
  
  // Wait additional time for physics to settle and rendering to stabilize
  await page.waitForTimeout(timeout);
}

// Helper to set theme
async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    localStorage.setItem('themeMode', t);
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, theme);
}

test.describe('Visual Regression Tests', () => {
  // Configure tests to run sequentially for stability
  test.describe.configure({ mode: 'serial' });

  test.describe('Empty Graph State', () => {
    test('empty graph - light theme - 3D view', async ({ page }) => {
      await setTheme(page, 'light');
      await mockGraphAPI(page, 'empty');
      
      await page.goto('/');
      await waitForGraphStable(page, 2000);
      
      // Take screenshot of the entire page
      await expect(page).toHaveScreenshot('empty-light-3d.png', {
        fullPage: false,
      });
    });

    test('empty graph - dark theme - 3D view', async ({ page }) => {
      await setTheme(page, 'dark');
      await mockGraphAPI(page, 'empty');
      
      await page.goto('/');
      await waitForGraphStable(page, 2000);
      
      await expect(page).toHaveScreenshot('empty-dark-3d.png', {
        fullPage: false,
      });
    });
  });

  test.describe('Small Graph (100 nodes)', () => {
    test('small graph - light theme - 3D view', async ({ page }) => {
      await setTheme(page, 'light');
      await mockGraphAPI(page, 'small');
      
      await page.goto('/');
      await waitForGraphStable(page, 5000);
      
      await expect(page).toHaveScreenshot('small-light-3d.png', {
        fullPage: false,
      });
    });

    test('small graph - dark theme - 3D view', async ({ page }) => {
      await setTheme(page, 'dark');
      await mockGraphAPI(page, 'small');
      
      await page.goto('/');
      await waitForGraphStable(page, 5000);
      
      await expect(page).toHaveScreenshot('small-dark-3d.png', {
        fullPage: false,
      });
    });

    test('small graph - light theme - 2D view', async ({ page }) => {
      await setTheme(page, 'light');
      await mockGraphAPI(page, 'small');
      
      await page.goto('/');
      await waitForGraphStable(page, 5000);
      
      // Switch to 2D view - look for view mode button
      const viewModeButton = page.getByRole('button', { name: /2D/i }).first();
      if (await viewModeButton.isVisible().catch(() => false)) {
        await viewModeButton.click();
        await waitForGraphStable(page, 3000);
      } else {
        // Try alternate selector
        await page.evaluate(() => {
          localStorage.setItem('viewMode', '2d');
        });
        await page.reload();
        await waitForGraphStable(page, 5000);
      }
      
      await expect(page).toHaveScreenshot('small-light-2d.png', {
        fullPage: false,
      });
    });

    test('small graph - dark theme - 2D view', async ({ page }) => {
      await setTheme(page, 'dark');
      await mockGraphAPI(page, 'small');
      
      await page.goto('/');
      
      // Set 2D view mode
      await page.evaluate(() => {
        localStorage.setItem('viewMode', '2d');
      });
      await page.reload();
      
      await waitForGraphStable(page, 5000);
      
      await expect(page).toHaveScreenshot('small-dark-2d.png', {
        fullPage: false,
      });
    });
  });

  test.describe('Large Graph (10k nodes)', () => {
    test('large graph - light theme - 3D view', async ({ page }) => {
      await setTheme(page, 'light');
      await mockGraphAPI(page, 'large');
      
      await page.goto('/');
      
      // Longer wait for large graphs to render
      await waitForGraphStable(page, 8000);
      
      await expect(page).toHaveScreenshot('large-light-3d.png', {
        fullPage: false,
        timeout: 30000, // Longer timeout for large graphs
      });
    });

    test('large graph - dark theme - 3D view', async ({ page }) => {
      await setTheme(page, 'dark');
      await mockGraphAPI(page, 'large');
      
      await page.goto('/');
      await waitForGraphStable(page, 8000);
      
      await expect(page).toHaveScreenshot('large-dark-3d.png', {
        fullPage: false,
        timeout: 30000,
      });
    });
  });

  test.describe('Zoomed Views', () => {
    test('small graph - zoomed in', async ({ page }) => {
      await setTheme(page, 'light');
      await mockGraphAPI(page, 'small');
      
      await page.goto('/');
      await waitForGraphStable(page, 5000);
      
      // Simulate zoom by scrolling (wheel events)
      const canvas = page.locator('canvas').first();
      if (await canvas.isVisible().catch(() => false)) {
        await canvas.hover();
        // Zoom in with wheel events
        await canvas.evaluate((el) => {
          const event = new WheelEvent('wheel', {
            deltaY: -300,
            bubbles: true,
            cancelable: true,
          });
          el.dispatchEvent(event);
        });
        await page.waitForTimeout(2000); // Wait for zoom animation
      }
      
      await expect(page).toHaveScreenshot('small-light-3d-zoomed.png', {
        fullPage: false,
      });
    });
  });

  test.describe('Dashboard View', () => {
    test('small graph - dashboard view - light theme', async ({ page }) => {
      await setTheme(page, 'light');
      await mockGraphAPI(page, 'small');
      
      await page.goto('/');
      
      // Switch to dashboard view
      await page.evaluate(() => {
        localStorage.setItem('viewMode', 'dashboard');
      });
      await page.reload();
      
      await waitForGraphStable(page, 3000);
      
      await expect(page).toHaveScreenshot('small-light-dashboard.png', {
        fullPage: false,
      });
    });

    test('small graph - dashboard view - dark theme', async ({ page }) => {
      await setTheme(page, 'dark');
      await mockGraphAPI(page, 'small');
      
      await page.goto('/');
      
      // Switch to dashboard view
      await page.evaluate(() => {
        localStorage.setItem('viewMode', 'dashboard');
      });
      await page.reload();
      
      await waitForGraphStable(page, 3000);
      
      await expect(page).toHaveScreenshot('small-dark-dashboard.png', {
        fullPage: false,
      });
    });
  });
});
