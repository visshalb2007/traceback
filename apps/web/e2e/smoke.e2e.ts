import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('landing page explains the product', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Who broke the build?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'I already have one' })).toBeVisible();
  });

  test('login page renders the sign-in form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create one' })).toBeVisible();
  });

  test('protected routes redirect anonymous visitors to login', async ({ page }) => {
    await page.goto('/projects');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});
