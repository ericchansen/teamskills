import { test, expect } from '@playwright/test';
import { mockDashboardApi } from './helpers/mockDashboardApi.js';

test.describe('Skill catalog admin editor', () => {
  test('redirects non-admin users away from the catalog editor', async ({ page }) => {
    await mockDashboardApi(page, { userType: 'member' });

    await page.goto('/skill-catalog');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.matrix-view')).toBeVisible();
  });

  test('loads the skill catalog editor for admins', async ({ page }) => {
    await mockDashboardApi(page);

    await page.goto('/skill-catalog');

    await expect(page.getByRole('heading', { name: 'Skill Catalog' })).toBeVisible();
  });

  test('makes the rename flow explicit for admins', async ({ page }) => {
    await mockDashboardApi(page);

    await page.goto('/skill-catalog');
    await page.getByLabel('What do you want to change?').selectOption('rename');

    await expect(page.getByLabel('Skill to rename')).toBeVisible();
    await expect(page.getByLabel('New approved skill name')).toBeVisible();
    await expect(
      page.getByText('Type only the new skill name. Do not include category or path text here.')
    ).toBeVisible();
    await expect(
      page.getByText('Category details are shown only to help you choose the right skill.')
    ).toBeVisible();
  });

  test('lets admins create and then rename a skill directly', async ({ page }) => {
    await mockDashboardApi(page);

    await page.goto('/skill-catalog');

    await page.getByLabel('New skill name').fill('Azure Quantum Accelerator');
    await page.getByLabel('Category for the new skill').selectOption('10');
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/skills') && response.request().method() === 'POST'),
      page.waitForResponse((response) => response.url().includes('/api/matrix') && response.request().method() === 'GET'),
      page.getByRole('button', { name: 'Create skill' }).click(),
    ]);

    await page.getByLabel('What do you want to change?').selectOption('rename');
    await expect(
      page.getByLabel('Skill to rename').locator('option', { hasText: 'Azure Quantum Accelerator' })
    ).toHaveCount(1);
    await page.getByLabel('Skill to rename').selectOption({ label: 'Azure Quantum Accelerator' });
    await page.getByLabel('New approved skill name').fill('Azure Quantum Accelerator Service');
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/skills/') && response.request().method() === 'PUT'),
      page.waitForResponse((response) => response.url().includes('/api/matrix') && response.request().method() === 'GET'),
      page.getByRole('button', { name: 'Rename skill' }).click(),
    ]);

    await page.getByLabel('What do you want to change?').selectOption('rename');
    await expect(
      page.getByLabel('Skill to rename').locator('option', { hasText: 'Azure Quantum Accelerator Service' })
    ).toHaveCount(1);
  });
});
