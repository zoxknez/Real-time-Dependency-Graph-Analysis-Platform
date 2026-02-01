import { test, expect } from '@playwright/test';

test('Live API demo page loads', async ({ page }) => {
  await page.goto('/agent-live');
  await expect(page.getByRole('heading', { name: /Live Voice Agent/i })).toBeVisible();
  await expect(page.getByText('Get Ephemeral Token')).toBeVisible();
  await expect(page.getByText('Auto Demo (3 prompts)')).toBeVisible();
});
