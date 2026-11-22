import { expect, test } from '@playwright/test';

/**
 * The whole product in sample mode (a fictional resume, canned parse, canned rewrites): upload step
 * -> review -> real PDF preview -> tailor -> accept a rewrite -> download. Also fails on any
 * browser console error, which is how a Content-Security-Policy violation shows up.
 */
test('sample resume: review, preview, tailor, accept a rewrite, download', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Upload your resume' })).toBeVisible();

  // The page must be protected by the strict policy (docs/SECURITY.md).
  const response = await page.request.get('/');
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'");

  await page.getByRole('button', { name: 'Try with a sample resume' }).click();
  await expect(page.getByRole('heading', { name: 'Review and edit' })).toBeVisible();

  // A real pdflatex build, shown in the preview frame.
  await page.getByRole('button', { name: 'Preview PDF' }).click();
  await expect(page.getByTitle('Resume PDF preview')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Tailor to a job description' }).click();
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('Skills the job asks for')).toBeVisible();

  await page.getByRole('button', { name: 'Suggest bullet rewrites' }).click();
  const rewrites = page.getByRole('list', { name: 'Suggested rewrites' });
  await expect(rewrites).toBeVisible({ timeout: 10_000 });
  await expect(rewrites.getByText('Blocked', { exact: true })).toHaveCount(2);

  await rewrites.getByRole('button', { name: 'Accept rewrite 2' }).click();
  await expect(rewrites.getByText('Accepted', { exact: true })).toBeVisible();

  // Accepting a rewrite changed the resume, so the old PDF is out of date: build it again, then download.
  await page.getByRole('button', { name: 'Continue to download' }).click();
  await expect(page.getByText(/changed the resume since the last PDF/)).toBeVisible();
  await page.getByRole('button', { name: 'Build PDF' }).click();
  await expect(page.getByText('Your PDF matches your latest edits.')).toBeVisible({
    timeout: 30_000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  expect(problems).toEqual([]);
});
