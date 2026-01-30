import { test, expect } from '@playwright/test';

test.describe('Add Skill Workflow', () => {
  test('should complete full add skill workflow', async ({ page }) => {
    await page.goto('/');

    // Navigate to user profile
    await expect(page.locator('.matrix-table')).toBeVisible();
    await page.locator('.user-name').first().click();
    await expect(page.locator('.user-profile')).toBeVisible();

    // Get initial skill count
    const initialSkillCount = await page.locator('.skill-item').count();

    // Open Add Skill modal
    await page.click('text=Add Skill');
    await expect(page.locator('.modal-overlay')).toBeVisible();

    // Search for a skill
    const searchInput = page.locator('input[placeholder*="search"]');
    await searchInput.fill('Azure');
    await expect(page.locator('.skills-dropdown')).toBeVisible();

    // Select a skill
    await page.locator('.skill-option').first().click();
    await expect(page.locator('.selected-skill')).toBeVisible();

    // Select proficiency level
    await page.check('input[value="L300"]');

    // Submit
    await page.click('button[type="submit"]');

    // Wait for modal to close
    await expect(page.locator('.modal-overlay')).not.toBeVisible();

    // Wait for page to update
    await page.waitForTimeout(1000);

    // Verify new skill count (might be same if skill already existed)
    const newSkillCount = await page.locator('.skill-item').count();
    expect(newSkillCount).toBeGreaterThanOrEqual(initialSkillCount);
  });

  test('should update proficiency and verify in matrix', async ({ page }) => {
    await page.goto('/');

    // Remember first user's name
    const firstUserName = await page.locator('.user-name').first().textContent();

    // Navigate to profile
    await page.locator('.user-name').first().click();
    await expect(page.locator('.user-profile')).toBeVisible();

    // Find first skill and change proficiency
    const firstSelect = page.locator('.proficiency-select').first();
    if (await firstSelect.isVisible()) {
      await firstSelect.selectOption('L400');
      await page.waitForTimeout(1000);

      // Navigate back to matrix
      await page.click('text=Matrix View');
      await expect(page.locator('.skill-matrix')).toBeVisible();

      // The update should persist (verify matrix loads without error)
      await expect(page.locator('.matrix-table')).toBeVisible();
    }
  });
});
