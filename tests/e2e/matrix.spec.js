import { test, expect } from '@playwright/test';

test.describe('Skills Matrix', () => {
  test('should display the skills matrix', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page.locator('h1')).toContainText('Team Skills Tracker');

    // Check matrix view button is active (it's the default)
    await expect(page.getByRole('button', { name: /Matrix/i }).first()).toHaveClass(/active/);

    // Check that skills matrix loads
    await expect(page.locator('.skill-matrix')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Skills Matrix');
  });

  test('should display users and skills', async ({ page }) => {
    await page.goto('/');

    // Wait for matrix to load
    await expect(page.locator('.matrix-table')).toBeVisible();

    // Check that we have users
    const userNames = page.locator('.user-name');
    await expect(userNames.first()).toBeVisible();

    // Check that we have skills
    const skillNames = page.locator('.skill-name');
    await expect(skillNames.first()).toBeVisible();

    // Check that proficiency badges are visible
    const badges = page.locator('.proficiency-badge');
    await expect(badges.first()).toBeVisible();
  });

  test('should filter skills by category', async ({ page }) => {
    await page.goto('/');

    // Wait for matrix to load
    await expect(page.locator('.matrix-table')).toBeVisible();

    // Get initial skill count
    const initialSkillHeaders = await page.locator('.skill-header').count();

    // Select a category filter
    await page.selectOption('select', { index: 1 }); // Select first non-"All" option

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Verify filtered skill count is different
    const filteredSkillHeaders = await page.locator('.skill-header').count();
    expect(filteredSkillHeaders).toBeLessThan(initialSkillHeaders);
  });

  test('should navigate to user profile', async ({ page }) => {
    await page.goto('/');

    // Wait for matrix to load
    await expect(page.locator('.matrix-table')).toBeVisible();

    // Click on first user
    const firstUser = page.locator('.user-name').first();
    const userName = await firstUser.textContent();
    await firstUser.click();

    // Check that we navigated to profile view
    await expect(page.locator('.user-profile')).toBeVisible();

    // Check that user name is displayed in profile
    await expect(page.locator('.user-profile h2')).toContainText(userName);
  });
});
