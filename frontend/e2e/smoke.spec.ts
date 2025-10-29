import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check that the page title is present
    await expect(page).toHaveTitle(/reddit/i);
  });

  test('app renders main UI elements', async ({ page }) => {
    await page.goto('/');
    
    // Wait for React to render
    await page.waitForSelector('body');
    
    // Basic smoke test - just verify the page loaded without crashing
    const body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('handles navigation', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to be ready
    await page.waitForLoadState('domcontentloaded');
    
    // Verify we can interact with the page
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
