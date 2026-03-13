import { expect, test } from "@playwright/test";

test("demo live scan can reach a report snapshot", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /enable demo mode/i }).click();
  await page.getByLabel(/property address/i).fill("15 Dandenong Rd, Clayton VIC 3168");
  await page.getByLabel(/real estate agency/i).fill("Ray White Clayton");
  await page.getByRole("button", { name: /^start scan$/i }).click();

  await expect(page).toHaveURL(/\/scan$/, { timeout: 15_000 });
  await page.getByRole("button", { name: /^start scan$/i }).click();

  await expect(page.getByText(/hazards:\s*[1-9]/i)).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: /end & generate report/i }).click();

  await expect(page).toHaveURL(/\/report\//, { timeout: 15_000 });
  await expect(page.getByText("Report Snapshot", { exact: true })).toBeVisible();
  await expect(page.getByText("1. Property Risk Score", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /export pdf/i })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/report\//, { timeout: 15_000 });
  await expect(page.getByText("Report Snapshot", { exact: true })).toBeVisible();
  await expect(page.getByText("1. Property Risk Score", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /export pdf/i })).toBeVisible();
});
