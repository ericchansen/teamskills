import { test, expect } from '@playwright/test';

test.describe('User Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Navigate to first user's profile
    await expect(page.locator('.matrix-table')).toBeVisible();
    await page.locator('.user-name').first().click();
    await expect(page.locator('.user-profile')).toBeVisible();
  });

  test('should display user information', async ({ page }) => {
    // Check user header
    await expect(page.locator('.user-profile h2')).toBeVisible();
    
    // Check user details
    await expect(page.locator('.user-details')).toBeVisible();
    
    // Check skills section
    await expect(page.locator('.skills-section')).toBeVisible();
  });

  test('should display user skills grouped by category', async ({ page }) => {
    // Check that category groups exist
    const categoryGroups = page.locator('.category-group');
    await expect(categoryGroups.first()).toBeVisible();

    // Check that skills are listed
    const skillItems = page.locator('.skill-item');
    await expect(skillItems.first()).toBeVisible();

    // Check that proficiency badges are visible
    const badges = page.locator('.proficiency-badge');
    await expect(badges.first()).toBeVisible();
  });

  test('should navigate back to matrix view', async ({ page }) => {
    // Click Back to Matrix button
    await page.click('text=Back to Matrix');

    // Check that matrix is visible
    await expect(page.locator('.skill-matrix')).toBeVisible();
  });
});

test.describe('User Profile - Logged In', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Login first
    await page.click('text=Login');
    await expect(page.locator('.login-modal')).toBeVisible();
    
    // Select first user from dropdown
    await page.locator('.login-modal select').selectOption({ index: 1 });
    
    // Wait for profile to load (login navigates to profile)
    await expect(page.locator('.user-profile')).toBeVisible();
    await expect(page.locator('.own-profile-badge')).toBeVisible();
  });

  test('should open add skill modal when logged in', async ({ page }) => {
    // Click Add Skill button (only visible when logged in and on own profile)
    await page.click('text=Add Skill');

    // Check modal is visible
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-content h3')).toContainText('Add Skill');

    // Check search input is visible
    await expect(page.locator('input[placeholder*="search"]')).toBeVisible();
  });

  test('should search and select a skill', async ({ page }) => {
    // Open modal
    await page.click('text=Add Skill');
    await expect(page.locator('.modal-overlay')).toBeVisible();

    // Type in search
    const searchInput = page.locator('input[placeholder*="search"]');
    await searchInput.fill('Azure');

    // Wait for dropdown to appear
    await expect(page.locator('.skills-dropdown')).toBeVisible();

    // Check that skills are shown
    const skillOptions = page.locator('.skill-option');
    await expect(skillOptions.first()).toBeVisible();

    // Click on a skill
    await skillOptions.first().click();

    // Check that skill is selected
    await expect(page.locator('.selected-skill')).toBeVisible();
  });

  test('should change proficiency level for existing skill', async ({ page }) => {
    // Find a skill item with a select dropdown
    const firstSelect = page.locator('.proficiency-select').first();
    
    if (await firstSelect.isVisible()) {
      const initialValue = await firstSelect.inputValue();
      
      // Change to a different level
      const newValue = initialValue === 'L100' ? 'L200' : 'L100';
      await firstSelect.selectOption(newValue);

      // Wait a moment for the change to process
      await page.waitForTimeout(1000);

      // Verify the value changed
      const updatedValue = await firstSelect.inputValue();
      expect(updatedValue).toBe(newValue);
    }
  });

  test('should close modal when clicking cancel', async ({ page }) => {
    // Open modal
    await page.click('text=Add Skill');
    await expect(page.locator('.modal-overlay')).toBeVisible();

    // Search and select a skill
    await page.locator('input[placeholder*="search"]').fill('Azure');
    await page.locator('.skill-option').first().click();

    // Click Cancel
    await page.click('text=Cancel');

    // Modal should be closed
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });
});
