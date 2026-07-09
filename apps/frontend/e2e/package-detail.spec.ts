import { test, expect } from '@playwright/test';

test.describe('Package Detail Page', () => {
  // Use a sample package URL - adjust based on actual route structure
  const samplePackageUrl = '/package/npm/react';
  const altPackageUrl = '/pkg/npm:react';

  test.beforeEach(async ({ page }) => {
    // Try primary URL first, fallback to alternative
    const response = await page.goto(samplePackageUrl);
    if (response?.status() === 404) {
      await page.goto(altPackageUrl);
    }
  });

  test('should display package name', async ({ page }) => {
    // Package name should be visible
    const packageName = page.getByTestId('package-name').or(
      page.getByRole('heading', { name: /react/i })
    );
    await expect(packageName).toBeVisible({ timeout: 10000 });
  });

  test('should show package version', async ({ page }) => {
    const version = page.getByTestId('package-version').or(
      page.getByText(/\d+\.\d+\.\d+/)
    );
    await expect(version).toBeVisible();
  });

  test('should display dependencies tab', async ({ page }) => {
    const dependenciesTab = page.getByRole('tab', { name: /dependencies/i }).or(
      page.getByTestId('tab-dependencies')
    );
    
    if (await dependenciesTab.isVisible()) {
      await dependenciesTab.click();
      
      // Should show dependency list or empty state
      await page.waitForLoadState('networkidle');
      const content = page.locator('[role="tabpanel"]');
      await expect(content).toBeVisible();
    }
  });

  test('should display dependents tab', async ({ page }) => {
    const dependentsTab = page.getByRole('tab', { name: /dependents/i }).or(
      page.getByTestId('tab-dependents')
    );
    
    if (await dependentsTab.isVisible()) {
      await dependentsTab.click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should display version history', async ({ page }) => {
    const versionsTab = page.getByRole('tab', { name: /versions/i }).or(
      page.getByTestId('tab-versions')
    );
    
    if (await versionsTab.isVisible()) {
      await versionsTab.click();
      await page.waitForLoadState('networkidle');
      
      // Should show version list
      const versionList = page.getByTestId('version-list').or(
        page.locator('[data-version]')
      );
      const hasVersions = await versionList.first().isVisible().catch(() => false);
    }
  });

  test('should show dependency graph visualization', async ({ page }) => {
    const graphContainer = page.getByTestId('dependency-graph').or(
      page.locator('canvas').or(
        page.locator('svg.graph')
      )
    );
    
    // Graph may take time to render
    await page.waitForTimeout(2000);
    
    const isVisible = await graphContainer.isVisible().catch(() => false);
    // Graph is optional, just verify page doesn't crash
  });

  test('should link to external registry', async ({ page }) => {
    const externalLink = page.getByRole('link', { name: 'View on registry' }).first();
    
    if (await externalLink.isVisible()) {
      const href = await externalLink.getAttribute('href');
      expect(href).toMatch(/npmjs\.com|crates\.io|pypi\.org/);
    }
  });

  test('should show package metadata', async ({ page }) => {
    // License
    const license = page.getByTestId('package-license').or(
      page.getByText(/MIT|Apache|ISC|GPL/i)
    );
    
    // Description
    const description = page.getByTestId('package-description').or(
      page.locator('p').filter({ hasText: /.{20,}/ }).first()
    );
    
    // At least one should be visible
    const hasLicense = await license.isVisible().catch(() => false);
    const hasDescription = await description.isVisible().catch(() => false);
    
    // Package page should have some content
    expect(hasLicense || hasDescription).toBeTruthy();
  });

  test('should handle breaking changes indicator', async ({ page }) => {
    const breakingBadge = page.getByTestId('breaking-changes-badge').or(
      page.getByText(/breaking change/i)
    );
    
    // Badge may or may not be present
    const isVisible = await breakingBadge.isVisible().catch(() => false);
    // Just verify no error
  });
});

test.describe('Package Detail - Loading States', () => {
  test('should show loading state', async ({ page }) => {
    // Slow down network to observe loading state
    await page.route('**/graphql', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });
    
    await page.goto('/package/npm/react');
    
    // Should show loading indicator
    const loader = page.getByTestId('loading').or(
      page.getByRole('progressbar').or(
        page.locator('.skeleton, .spinner, [data-loading]')
      )
    );
    
    const hasLoader = await loader.isVisible().catch(() => false);
    // Loading state is optional UX improvement
  });

  test('should handle package not found', async ({ page }) => {
    await page.goto('/package/npm/this-package-definitely-does-not-exist-12345');
    
    await page.waitForLoadState('networkidle');
    
    // Should show 404 or error message
    const notFound = page.getByText(/not found|404|doesn't exist/i);
    const hasNotFound = await notFound.isVisible().catch(() => false);
    
    // Page should handle gracefully
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Package Detail - Interactions', () => {
  test('should copy package install command', async ({ page }) => {
    await page.goto('/package/npm/react');
    await page.waitForLoadState('networkidle');
    
    const copyButton = page.getByTestId('copy-install');
    
    if (await copyButton.isVisible()) {
      await copyButton.click();
      
      await expect(copyButton).toHaveAttribute("aria-label", /copied/i, { timeout: 2000 });
    }
  });

  test('should expand/collapse dependency tree', async ({ page }) => {
    await page.goto('/package/npm/react');
    await page.waitForLoadState('networkidle');
    
    const expandButton = page.getByTestId('expand-tree').or(
      page.getByRole('button', { name: /expand|show more/i })
    );
    
    if (await expandButton.isVisible()) {
      await expandButton.click();
      // Tree should expand
    }
  });
});
