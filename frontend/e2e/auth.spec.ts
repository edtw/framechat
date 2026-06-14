import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');

    // Check page title
    await expect(page.locator('h1')).toContainText('AFILIATORS');

    // Check form elements exist
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('shows error on empty form submission', async ({ page }) => {
    await page.goto('/login');
    await page.locator('button[type="submit"]').click();

    // Should show validation error
    await expect(page.locator('text=Preencha todos os campos')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('fake@test.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Should show auth error message
    await expect(page.locator('[class*="red"]')).toBeVisible({ timeout: 10000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('admin@afiliators.local');
    await page.locator('#password').fill('admin123');
    await page.locator('button[type="submit"]').click();

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});
