import { test, expect } from '@playwright/test';

async function openProfile(page) {
  await page.goto('/');
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('.matrix-view')).toBeVisible({ timeout: 15000 });
  await page.getByRole('link', { name: 'My Profile' }).click();
  await expect(page.locator('.profile-page')).toBeVisible();
}

test.describe('User Profile', () => {
  test.beforeEach(async ({ page }) => {
    await openProfile(page);
  });

  test('should display the user summary card and skill editor', async ({ page }) => {
    await expect(page.locator('.user-card')).toBeVisible();

    if (await page.locator('.skills-editor').count()) {
      await expect(page.locator('.skills-editor')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'My Skills' })).toBeVisible();
    } else {
      await expect(page.locator('.no-profile-msg')).toContainText('demo mode');
    }
  });

  test('should display grouped skill categories and rows', async ({ page }) => {
    if (await page.locator('.skills-editor').count()) {
      await expect(page.locator('.skill-category').first()).toBeVisible();
      await expect(page.locator('.skill-row').first()).toBeVisible();
      await expect(page.locator('.level-btn').first()).toBeVisible();
    } else {
      await expect(page.locator('.no-profile-msg')).toContainText('Sign in to manage your skills');
    }
  });

  test('should show profile filters and explain the taxonomy workflow', async ({ page }) => {
    if (await page.locator('.skills-editor').count()) {
      await expect(page.getByPlaceholder('Search skills or categories')).toBeVisible();
      await expect(page.getByRole('combobox').first()).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Rated only' })).toBeVisible();
      await expect(page.locator('.catalog-help')).toContainText('admin workflow');
    } else {
      await expect(page.locator('.no-profile-msg')).toContainText('demo mode');
    }
  });

  test('should filter visible skills by search text', async ({ page }) => {
    if (await page.locator('.skills-editor').count() === 0) {
      await expect(page.locator('.no-profile-msg')).toContainText('demo mode');
      return;
    }

    const searchInput = page.getByPlaceholder('Search skills or categories');
    await searchInput.fill('Bot Service');

    await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Azure AI Bot Service' })).toBeVisible();
    await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Retrieval-Augmented Generation (RAG)' })).toHaveCount(0);
  });

  test('should collapse and expand a skill category', async ({ page }) => {
    if (await page.locator('.skills-editor').count() === 0) {
      await expect(page.locator('.no-profile-msg')).toContainText('demo mode');
      return;
    }

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
    if (await page.locator('.skills-editor').count()) {
      // These canonical relabels exist in both mock data and the live DB
      await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Retrieval-Augmented Generation (RAG)' })).toBeVisible();
      await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Azure AI Bot Service' })).toBeVisible();
    } else {
      await expect(page.locator('.no-profile-msg')).toContainText('demo mode');
    }
  });
});
