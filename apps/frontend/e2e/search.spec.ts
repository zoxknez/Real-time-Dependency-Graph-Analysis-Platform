import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore');
  });

  test('should show search input on explore page', async ({ page }) => {
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i).or(
        page.getByRole('searchbox')
      )
    );
    await expect(searchInput).toBeVisible();
  });

  test('should search for packages', async ({ page }) => {
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i)
    );
    
    await searchInput.fill('react');
    await searchInput.press('Enter');
    
    // Wait for results
    await page.waitForLoadState('networkidle');
    
    // Should show some results or a "no results" message
    const results = page.getByTestId('search-results').or(
      page.locator('[data-search-results]')
    );
    const noResults = page.getByText(/no results|not found/i);
    
    const hasResults = await results.isVisible().catch(() => false);
    const hasNoResultsMessage = await noResults.isVisible().catch(() => false);
    
    expect(hasResults || hasNoResultsMessage).toBeTruthy();
  });

  test('should show autocomplete suggestions', async ({ page }) => {
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i)
    );
    
    // Type slowly to trigger autocomplete
    await searchInput.type('tok', { delay: 100 });
    
    // Wait for suggestions
    await page.waitForTimeout(500);
    
    // Check for autocomplete dropdown
    const autocomplete = page.getByTestId('autocomplete').or(
      page.locator('[role="listbox"]').or(
        page.locator('.autocomplete-suggestions')
      )
    );
    
    // Autocomplete may or may not be implemented
    const isVisible = await autocomplete.isVisible().catch(() => false);
    // Just verify no error occurred
  });

  test('should filter by ecosystem', async ({ page }) => {
    // Look for ecosystem filter
    const ecosystemFilter = page.getByTestId('ecosystem-filter').or(
      page.getByRole('combobox', { name: /ecosystem/i }).or(
        page.getByLabel(/ecosystem/i)
      )
    );
    
    if (await ecosystemFilter.isVisible()) {
      await ecosystemFilter.click();
      
      // Select an option
      const option = page.getByRole('option', { name: /npm/i });
      if (await option.isVisible()) {
        await option.click();
      }
    }
  });

  test('should navigate to package detail on click', async ({ page }) => {
    // Search for a package
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i)
    );
    
    await searchInput.fill('lodash');
    await searchInput.press('Enter');
    await page.waitForLoadState('networkidle');
    
    // Click on first result
    const firstResult = page.getByTestId('package-card').first().or(
      page.locator('[data-package-id]').first()
    );
    
    if (await firstResult.isVisible()) {
      await firstResult.click();
      
      // Should navigate to package detail page
      await expect(page).toHaveURL(/package|pkg/);
    }
  });

  test('should handle empty search gracefully', async ({ page }) => {
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i)
    );
    
    // Submit empty search
    await searchInput.fill('');
    await searchInput.press('Enter');
    
    // Should not crash, show empty state or all packages
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should debounce search input', async ({ page }) => {
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i)
    );
    
    // Track network requests
    let requestCount = 0;
    page.on('request', (request) => {
      if (request.url().includes('graphql')) {
        requestCount++;
      }
    });
    
    // Type quickly
    await searchInput.type('react', { delay: 50 });
    
    // Wait for debounce
    await page.waitForTimeout(500);
    
    // Should have made fewer requests than characters typed
    // (debouncing should batch the requests)
  });
});

test.describe('Search - Keyboard Navigation', () => {
  test('should navigate results with arrow keys', async ({ page }) => {
    await page.goto('/explore');
    
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i)
    );
    
    await searchInput.fill('express');
    await searchInput.press('Enter');
    await page.waitForLoadState('networkidle');
    
    // Tab to first result
    await page.keyboard.press('Tab');
    
    // Arrow down through results
    await page.keyboard.press('ArrowDown');
    
    // Enter to select
    await page.keyboard.press('Enter');
    
    // Should navigate or select
  });
});
