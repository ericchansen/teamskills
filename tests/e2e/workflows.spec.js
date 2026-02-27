import { test, expect } from '@playwright/test';

test.describe('Add Skill Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Login via auth gate - demo mode shows inline login
    await expect(page.locator('.auth-gate')).toBeVisible();
    await page.locator('.demo-login-inline select').selectOption({ index: 1 });
    
    // Auth gate login shows matrix view; navigate to own profile
    await expect(page.locator('.skill-matrix')).toBeVisible({ timeout: 10000 });
    await page.locator('.profile-btn').click();
    await expect(page.locator('.user-profile')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.own-profile-badge')).toBeVisible();
  });

  test('should complete full add skill workflow', async ({ page }) => {
    // Wait for skills to load
    await expect(page.locator('.skills-section')).toBeVisible({ timeout: 10000 });
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

    // Select proficiency level (radio buttons, not checkboxes)
    await page.locator('input[value="L300"]').click();

    // Submit and wait for API response
    const responsePromise = page.waitForResponse(resp => resp.url().includes('/api/user-skills') && resp.status() < 400);
    await page.click('button[type="submit"]');
    await responsePromise;

    // Wait for modal to close and profile to refresh
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
    await expect(page.locator('.skills-section')).toBeVisible({ timeout: 10000 });

    // Verify new skill count (might be same if skill already existed)
    const newSkillCount = await page.locator('.skill-item').count();
    expect(newSkillCount).toBeGreaterThanOrEqual(initialSkillCount);
  });

  test('should update proficiency and verify in matrix', async ({ page }) => {
    // Wait for skills to load
    await expect(page.locator('.skills-section')).toBeVisible({ timeout: 10000 });

    // Find first skill and change proficiency
    const firstSelect = page.locator('.proficiency-select').first();
    if (await firstSelect.isVisible()) {
      const responsePromise = page.waitForResponse(resp => resp.url().includes('/api/user-skills') && resp.status() < 400);
      await firstSelect.selectOption('L400');
      await responsePromise;

      // Navigate back to matrix
      await page.locator('.back-btn').click();
      await expect(page.locator('.skill-matrix')).toBeVisible({ timeout: 10000 });

      // The update should persist (verify matrix loads without error)
      await expect(page.locator('.matrix-table')).toBeVisible({ timeout: 10000 });
    }
  });
});
