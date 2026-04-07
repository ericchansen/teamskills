import { test, expect } from '@playwright/test';
import {
  chooseTargetLevel,
  loadDashboard,
  mockDashboardApi,
  readGraphEdgeCount,
  readJsonSummary,
  thresholdDelta,
} from './helpers/mockDashboardApi.js';

async function openProfile(page) {
  await loadDashboard(page);
  await page.locator('.header-user').getByRole('link', { name: 'Alex Chen' }).click();
  await expect(page.locator('.profile-page')).toBeVisible();
}

function updateVisibleGapBreakdown(metric, fromLevel, toLevel) {
  const nextMetric = { ...metric };
  const trackedLevels = [300, 400];

  if (trackedLevels.includes(fromLevel)) {
    nextMetric[`L${fromLevel}`] = Math.max((nextMetric[`L${fromLevel}`] || 0) - 1, 0);
  }

  if (trackedLevels.includes(toLevel)) {
    nextMetric[`L${toLevel}`] = (nextMetric[`L${toLevel}`] || 0) + 1;
  }

  return nextMetric;
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

test.describe('Profile shared state sync', () => {
  test('should propagate a saved profile skill update to shared views', async ({ page }) => {
    const trackedSkill = 'Azure Functions';

    await mockDashboardApi(page);
    await loadDashboard(page);
    const initialMatrixSummary = await readJsonSummary(page, 'matrix-current-user-levels');
    const initialLevel = initialMatrixSummary[trackedSkill];
    const nextLevel = chooseTargetLevel(initialLevel);
    const expectedDelta = thresholdDelta(initialLevel);

    await page.getByRole('link', { name: 'Skills Graph' }).click();
    await expect(page.locator('.graph-view')).toBeVisible();
    const initialEdgeCount = await readGraphEdgeCount(page);

    await page.getByRole('link', { name: 'Gap Analysis' }).click();
    await expect(page.locator('.gap-view')).toBeVisible();
    const initialGapSummary = await readJsonSummary(page, 'gap-metric-summary');
    const initialGapMetric = initialGapSummary[trackedSkill];

    await page.locator('.header-user').getByRole('link', { name: 'Alex Chen' }).click();
    await expect(page.locator('.skills-editor')).toBeVisible();

    await page.getByPlaceholder('Search skills or categories').fill(trackedSkill);
    const skillRow = page.locator('.skill-row').filter({ hasText: trackedSkill });
    await expect(skillRow).toHaveCount(1);

    await skillRow.getByRole('button', { name: String(nextLevel) }).click();
    await expect(page.locator('.save-status.saved')).toBeVisible();
    await expect(skillRow.getByRole('button', { name: String(nextLevel) })).toHaveClass(/active/);

    await page.getByRole('link', { name: 'Skills Matrix' }).click();
    await expect(page.locator('.matrix-view')).toBeVisible();
    const updatedMatrixSummary = await readJsonSummary(page, 'matrix-current-user-levels');
    expect(updatedMatrixSummary[trackedSkill]).toBe(nextLevel);

    await page.getByRole('link', { name: 'Skills Graph' }).click();
    await expect(page.locator('.graph-view')).toBeVisible();
    expect(await readGraphEdgeCount(page)).toBe(initialEdgeCount + expectedDelta);

    await page.getByRole('link', { name: 'Gap Analysis' }).click();
    await expect(page.locator('.gap-view')).toBeVisible();
    const updatedGapSummary = await readJsonSummary(page, 'gap-metric-summary');
    expect(updatedGapSummary[trackedSkill]).toEqual(
      updateVisibleGapBreakdown(initialGapMetric, initialLevel, nextLevel)
    );
  });

  test('should roll back shared views when a profile skill save fails', async ({ page }) => {
    const trackedSkill = 'Azure Functions';

    await mockDashboardApi(page, { failNextSave: true });
    await loadDashboard(page);
    const initialMatrixSummary = await readJsonSummary(page, 'matrix-current-user-levels');
    const initialLevel = initialMatrixSummary[trackedSkill];
    const nextLevel = chooseTargetLevel(initialLevel);
    const initialMatrixValue = initialMatrixSummary[trackedSkill];

    await page.getByRole('link', { name: 'Skills Graph' }).click();
    await expect(page.locator('.graph-view')).toBeVisible();
    const initialEdgeCount = await readGraphEdgeCount(page);

    await page.getByRole('link', { name: 'Gap Analysis' }).click();
    await expect(page.locator('.gap-view')).toBeVisible();
    const initialGapSummary = await readJsonSummary(page, 'gap-metric-summary');
    const initialGapMetric = initialGapSummary[trackedSkill];

    await page.locator('.header-user').getByRole('link', { name: 'Alex Chen' }).click();
    await expect(page.locator('.skills-editor')).toBeVisible();

    await page.getByPlaceholder('Search skills or categories').fill(trackedSkill);
    const skillRow = page.locator('.skill-row').filter({ hasText: trackedSkill });
    await expect(skillRow).toHaveCount(1);

    await skillRow.getByRole('button', { name: String(nextLevel) }).click();
    await expect(skillRow.getByRole('button', { name: String(nextLevel) })).toHaveClass(/active/);
    await expect(page.locator('.save-status.error')).toBeVisible();
    await expect(skillRow.getByRole('button', { name: String(initialLevel) })).toHaveClass(/active/);

    await page.getByRole('link', { name: 'Skills Matrix' }).click();
    await expect(page.locator('.matrix-view')).toBeVisible();
    const rolledBackMatrixSummary = await readJsonSummary(page, 'matrix-current-user-levels');
    expect(rolledBackMatrixSummary[trackedSkill]).toBe(initialMatrixValue);

    await page.getByRole('link', { name: 'Skills Graph' }).click();
    await expect(page.locator('.graph-view')).toBeVisible();
    expect(await readGraphEdgeCount(page)).toBe(initialEdgeCount);

    await page.getByRole('link', { name: 'Gap Analysis' }).click();
    await expect(page.locator('.gap-view')).toBeVisible();
    const rolledBackGapSummary = await readJsonSummary(page, 'gap-metric-summary');
    expect(rolledBackGapSummary[trackedSkill]).toEqual(initialGapMetric);
  });
});
