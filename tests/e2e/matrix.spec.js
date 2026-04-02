import { test, expect } from '@playwright/test';

async function loadDashboard(page) {
  await page.goto('/');
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('.matrix-view')).toBeVisible({ timeout: 15000 });
}

test.describe('Skills Matrix', () => {
  test.beforeEach(async ({ page }) => {
    await loadDashboard(page);
  });

  test('should render the matrix dashboard shell', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Team Skills' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skills Matrix' })).toHaveClass(/active/);
    await expect(page.locator('.matrix-view .cat-btn').first()).toBeVisible();
    await expect(page.locator('.matrix-view canvas')).toBeVisible();
  });

  test('should collapse and expand a role in the matrix controls', async ({ page }) => {
    const firstRole = page.locator('.matrix-view .cat-btn').first();

    await expect(firstRole).toBeVisible();
    await expect(firstRole).not.toHaveClass(/collapsed/);

    await firstRole.click();
    await expect(firstRole).toHaveClass(/collapsed/);

    await firstRole.click();
    await expect(firstRole).not.toHaveClass(/collapsed/);
  });

  test('should navigate to the profile page from the header', async ({ page }) => {
    const profileLink = page.getByRole('link', { name: 'My Profile' });

    await expect(profileLink).toBeVisible();
    await profileLink.click();

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('.profile-page')).toBeVisible();
    await expect(page.locator('.user-card')).toBeVisible();
  });

  test('should show canonical labels in the profile editor', async ({ page }) => {
    await page.getByRole('link', { name: 'My Profile' }).click();

    await expect(page.locator('.profile-page')).toBeVisible();

    if (await page.locator('.skills-editor').count()) {
      // These canonical relabels exist in both mock data and the live DB
      await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Microsoft Foundry' })).toBeVisible();
      await expect(page.locator('.skill-row .skill-name').filter({ hasText: 'Azure AI Services (OpenAI)' })).toBeVisible();
    } else {
      await expect(page.locator('.no-profile-msg')).toContainText('demo mode');
    }
  });
});
