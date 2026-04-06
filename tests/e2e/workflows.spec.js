import { test, expect } from '@playwright/test';
import { loadDashboard, mockDashboardApi } from './helpers/mockDashboardApi.js';

test.describe('Dashboard workflows', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardApi(page);
    await loadDashboard(page);
  });

  test('should show the graph page with the default L400 threshold', async ({ page }) => {
    await page.getByRole('link', { name: 'Skills Graph' }).click();

    await expect(page).toHaveURL(/\/graph$/);
    await expect(page.locator('.graph-view')).toBeVisible();
    await expect(page.locator('.threshold-badge')).toContainText('400');
    await expect(page.locator('.edge-count')).toContainText('connections');
  });

  test('should allow changing the graph threshold', async ({ page }) => {
    await page.getByRole('link', { name: 'Skills Graph' }).click();

    const slider = page.locator('#threshold-slider');
    await expect(slider).toBeVisible();

    await slider.evaluate((element) => {
      element.value = '300';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(page.locator('.threshold-badge')).toContainText('300');
  });

  test('should show the gap analysis page with configurable thresholds', async ({ page }) => {
    await page.getByRole('link', { name: 'Gap Analysis' }).click();

    await expect(page).toHaveURL(/\/gap-analysis$/);
    await expect(page.locator('.gap-view')).toBeVisible();
    await expect(page.locator('#mode-select')).toHaveValue('expert');
    await expect(page.locator('.threshold-input').first()).toHaveValue('2');
    await expect(page.locator('.threshold-input').nth(1)).toHaveValue('1');
  });

  test('should update gap-analysis thresholds when switching modes', async ({ page }) => {
    await page.getByRole('link', { name: 'Gap Analysis' }).click();

    await page.locator('#mode-select').selectOption('average');

    await expect(page.locator('.threshold-input').first()).toHaveValue('250');
    await expect(page.locator('.threshold-input').nth(1)).toHaveValue('175');
  });

  test('should keep the skill catalog editor out of the primary nav and open it from profile', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Skill Catalog' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'My Profile' })).toHaveCount(0);

    await page.locator('.header-user').getByRole('link', { name: 'Alex Chen' }).click();
    await expect(page.locator('.profile-page')).toBeVisible();

    await page.getByRole('link', { name: 'Open skill catalog editor' }).click();

    await expect(page).toHaveURL(/\/skill-catalog$/);
    await expect(page.locator('.skill-catalog-admin')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Skill Catalog' })).toBeVisible();
  });

  test('should redirect unknown routes back to the matrix', async ({ page }) => {
    await page.goto('/not-a-real-route');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.matrix-view')).toBeVisible();
  });
});
