import { test, expect } from '@playwright/test';

test.describe('WhatsApp', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.locator('#email').fill('admin@afiliators.local');
    await page.locator('#password').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
  });

  test('navigates to WhatsApp page', async ({ page }) => {
    await page.goto('/whatsapp');
    await expect(page.locator('h1')).toContainText('WhatsApp');
  });

  test('shows empty state when no sessions', async ({ page }) => {
    await page.goto('/whatsapp');
    await expect(page.locator('text=Nenhuma sessao')).toBeVisible({ timeout: 10000 });
  });

  test('create session button opens modal', async ({ page }) => {
    await page.goto('/whatsapp');
    await page.locator('button:has-text("Nova Sessao")').click();
    // QR modal should appear
    await expect(page.locator('text=QR Code')).toBeVisible({ timeout: 15000 });
  });
});
