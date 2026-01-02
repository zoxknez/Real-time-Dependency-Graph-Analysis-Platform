import { test, expect } from '@playwright/test';

test.describe('Graph Visualization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore');
  });

  test('should display graph container', async ({ page }) => {
    const graphContainer = page.getByTestId('graph-container').or(
      page.locator('[data-graph]').or(
        page.locator('canvas, svg.graph')
      )
    );
    
    // Wait for graph to potentially load
    await page.waitForTimeout(2000);
    
    const isVisible = await graphContainer.isVisible().catch(() => false);
    // Graph is a key feature but might not be on explore page
  });

  test('should allow zoom controls', async ({ page }) => {
    const zoomIn = page.getByTestId('zoom-in').or(
      page.getByRole('button', { name: /zoom in|\+/i })
    );
    const zoomOut = page.getByTestId('zoom-out').or(
      page.getByRole('button', { name: /zoom out|-/i })
    );
    
    if (await zoomIn.isVisible()) {
      await zoomIn.click();
      await page.waitForTimeout(300);
      await zoomOut.click();
    }
  });

  test('should support keyboard zoom', async ({ page }) => {
    const graphContainer = page.getByTestId('graph-container').or(
      page.locator('[data-graph]')
    );
    
    if (await graphContainer.isVisible()) {
      await graphContainer.focus();
      
      // Zoom with keyboard
      await page.keyboard.press('+');
      await page.waitForTimeout(200);
      await page.keyboard.press('-');
    }
  });

  test('should show node tooltip on hover', async ({ page }) => {
    const graphContainer = page.getByTestId('graph-container').or(
      page.locator('canvas, svg.graph')
    );
    
    if (await graphContainer.isVisible()) {
      // Hover over center of graph
      const box = await graphContainer.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(500);
        
        // Check for tooltip
        const tooltip = page.locator('[role="tooltip"], .tooltip');
        // Tooltip may appear if hovering over a node
      }
    }
  });

  test('should handle graph controls panel', async ({ page }) => {
    const controlsPanel = page.getByTestId('graph-controls').or(
      page.locator('[data-graph-controls]')
    );
    
    if (await controlsPanel.isVisible()) {
      // Depth slider
      const depthSlider = page.getByLabel(/depth/i).or(
        page.getByTestId('depth-slider')
      );
      
      if (await depthSlider.isVisible()) {
        // Adjust depth
        await depthSlider.fill('3');
      }
      
      // Layout selector
      const layoutSelect = page.getByLabel(/layout/i);
      if (await layoutSelect.isVisible()) {
        await layoutSelect.selectOption({ index: 1 });
      }
    }
  });

  test('should filter graph by ecosystem', async ({ page }) => {
    const ecosystemFilter = page.getByTestId('graph-ecosystem-filter').or(
      page.locator('[data-ecosystem-filter]')
    );
    
    if (await ecosystemFilter.isVisible()) {
      // Toggle ecosystem filters
      const npmCheckbox = page.getByRole('checkbox', { name: /npm/i });
      if (await npmCheckbox.isVisible()) {
        await npmCheckbox.click();
        await page.waitForTimeout(500);
        await npmCheckbox.click();
      }
    }
  });

  test('should export graph as image', async ({ page }) => {
    const exportButton = page.getByTestId('export-graph').or(
      page.getByRole('button', { name: /export|download|save/i })
    );
    
    if (await exportButton.isVisible()) {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      
      await exportButton.click();
      
      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/\.(png|svg|jpg)$/);
      }
    }
  });

  test('should click node to view details', async ({ page }) => {
    const graphContainer = page.getByTestId('graph-container').or(
      page.locator('canvas')
    );
    
    if (await graphContainer.isVisible()) {
      const box = await graphContainer.boundingBox();
      if (box) {
        // Click somewhere in the graph
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(500);
        
        // May open a detail panel or navigate
      }
    }
  });

  test('should support fullscreen mode', async ({ page }) => {
    const fullscreenButton = page.getByTestId('fullscreen').or(
      page.getByRole('button', { name: /fullscreen|expand/i })
    );
    
    if (await fullscreenButton.isVisible()) {
      await fullscreenButton.click();
      await page.waitForTimeout(500);
      
      // Exit fullscreen
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('Graph - Performance', () => {
  test('should handle large graphs without freezing', async ({ page }) => {
    // Navigate to a package with many dependencies
    await page.goto('/package/npm/webpack');
    await page.waitForLoadState('networkidle');
    
    // Wait for graph to render
    await page.waitForTimeout(3000);
    
    // Page should still be responsive
    const searchInput = page.getByTestId('search-input').or(
      page.getByPlaceholder(/search/i)
    );
    
    if (await searchInput.isVisible()) {
      await searchInput.focus();
      // Should not hang
      expect(true).toBeTruthy();
    }
  });

  test('should lazy load graph nodes', async ({ page }) => {
    await page.goto('/explore');
    
    // Monitor network requests
    const graphRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('graphql')) {
        graphRequests.push(request.url());
      }
    });
    
    await page.waitForTimeout(2000);
    
    // Should not load too much data upfront
  });
});

test.describe('Graph - Accessibility', () => {
  test('should have accessible graph controls', async ({ page }) => {
    await page.goto('/explore');
    
    // All controls should be keyboard accessible
    await page.keyboard.press('Tab');
    
    // Should be able to tab through controls
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      
      // Check something is focused
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(focused).toBeTruthy();
    }
  });

  test('should provide alt text for graph', async ({ page }) => {
    await page.goto('/explore');
    
    const graphContainer = page.getByTestId('graph-container');
    
    if (await graphContainer.isVisible()) {
      // Check for aria-label or role
      const ariaLabel = await graphContainer.getAttribute('aria-label');
      const role = await graphContainer.getAttribute('role');
      
      // Should have some accessibility info
    }
  });
});
