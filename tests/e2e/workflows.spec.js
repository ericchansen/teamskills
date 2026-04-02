import { test, expect } from '@playwright/test';

async function loadDashboard(page) {
  await page.goto('/');
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('.matrix-view')).toBeVisible({ timeout: 15000 });
}

test.describe('Dashboard workflows', () => {
  test.beforeEach(async ({ page }) => {
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

  test('should load the taxonomy review page for admins', async ({ page }) => {
    const taxonomyLink = page.getByRole('link', { name: 'Taxonomy Review' });
    await expect(taxonomyLink).toBeVisible();

    await taxonomyLink.click();

    await expect(page).toHaveURL(/\/admin\/taxonomy$/);
    await expect(page.locator('.taxonomy-review')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Taxonomy Review' })).toBeVisible();

    const proposalCards = page.locator('.proposal-card');
    if (await proposalCards.count()) {
      await expect(proposalCards.first()).toContainText(/Suggested action:/);
    } else {
      await expect(page.locator('.info-card')).toContainText(/No proposals found|Could not load proposals/i);
    }
  });
});
