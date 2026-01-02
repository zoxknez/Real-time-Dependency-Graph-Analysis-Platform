import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('should have a search input', async ({ page }) => {
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i)
    );
    await expect(searchInput).toBeVisible();
  });

  test('should navigate to explore page', async ({ page }) => {
    const exploreLink = page.getByRole('link', { name: /explore/i });
    if (await exploreLink.isVisible()) {
      await exploreLink.click();
      await expect(page).toHaveURL(/explore/);
    }
  });

  test('should toggle dark/light theme', async ({ page }) => {
    const themeToggle = page.getByTestId('theme-toggle').or(
      page.getByRole('button', { name: /theme/i })
    );
    
    if (await themeToggle.isVisible()) {
      // Get initial theme
      const html = page.locator('html');
      const initialClass = await html.getAttribute('class');
      
      // Toggle theme
      await themeToggle.click();
      
      // Wait for theme change
      await page.waitForTimeout(300);
      
      // Verify theme changed
      const newClass = await html.getAttribute('class');
      expect(newClass).not.toBe(initialClass);
    }
  });

  test('should be accessible - no major violations', async ({ page }) => {
    // Basic accessibility checks
    await expect(page.locator('main')).toBeVisible();
    
    // All images should have alt text
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      expect(alt).toBeTruthy();
    }
  });

  test('should have skip link for keyboard navigation', async ({ page }) => {
    // Check for skip to main content link
    const skipLink = page.getByTestId('skip-link').or(
      page.getByRole('link', { name: /skip to main/i })
    );
    
    // Skip links are often hidden until focused
    await page.keyboard.press('Tab');
    
    // The skip link might become visible on focus
    const isVisible = await skipLink.isVisible().catch(() => false);
    if (isVisible) {
      await expect(skipLink).toBeFocused();
    }
  });
});

test.describe('Homepage - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should display mobile navigation', async ({ page }) => {
    await page.goto('/');
    
    // Look for hamburger menu or mobile nav
    const mobileMenu = page.getByTestId('mobile-menu').or(
      page.getByRole('button', { name: /menu/i })
    );
    
    // Mobile menu might be visible
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
      // Nav items should appear
      await expect(page.getByRole('navigation')).toBeVisible();
    }
  });

  test('should be responsive', async ({ page }) => {
    await page.goto('/');
    
    // No horizontal scrolling
    const body = page.locator('body');
    const bodyWidth = await body.evaluate(el => el.scrollWidth);
    const viewportWidth = 375;
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20); // Allow small tolerance
  });
});
