import { test, expect } from '@playwright/test';
import { loadDashboard, mockDashboardApi } from './helpers/mockDashboardApi.js';

async function openProfile(page) {
  await loadDashboard(page);
  await page.locator('.header-user').getByRole('link', { name: 'Alex Chen' }).click();
  await expect(page.locator('.profile-page')).toBeVisible();
}

test.describe('User Profile', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardApi(page);
    await openProfile(page);
  });

  test('should display the user summary card and skill editor', async ({ page }) => {
    await expect(page.locator('.user-card')).toBeVisible();
    await expect(page.locator('.skills-editor')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
  });

  test('should display grouped skill categories and rows', async ({ page }) => {
    await expect(page.locator('.skill-category').first()).toBeVisible();
    await expect(page.locator('.skill-row').first()).toBeVisible();
    await expect(page.locator('.level-btn').first()).toBeVisible();
  });

  test('should show profile filters plus separate sync and catalog guidance', async ({ page }) => {
    await expect(page.getByPlaceholder('Search skills or categories')).toBeVisible();
    await expect(page.getByRole('combobox').first()).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Rated only' })).toBeVisible();
    await expect(page.locator('.profile-sync-help')).toContainText('does not update SharePoint');
    await expect(page.locator('.catalog-help')).toContainText('Editing the shared skill catalog is a separate admin task');
    await expect(page.getByRole('link', { name: 'Open skill catalog editor' })).toBeVisible();
  });

  test('should filter visible skills by search text', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search skills or categories');
    await searchInput.fill('Bot Service');

    await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Azure AI Bot Service' })).toBeVisible();
    await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Retrieval-Augmented Generation (RAG)' })).toHaveCount(0);
  });

  test('should collapse and expand a skill category', async ({ page }) => {
    const firstCategory = page.locator('.cat-header').first();
    const firstChevron = firstCategory.locator('.cat-chevron');

    await expect(firstCategory).toBeVisible();
    await expect(firstChevron).not.toHaveClass(/collapsed/);

    await firstCategory.click();
    await expect(firstChevron).toHaveClass(/collapsed/);

    await firstCategory.click();
    await expect(firstChevron).not.toHaveClass(/collapsed/);
  });

  test('should surface official Microsoft skill labels in the editor', async ({ page }) => {
    await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Retrieval-Augmented Generation (RAG)' })).toBeVisible();
    await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Azure AI Bot Service' })).toBeVisible();
  });
});
