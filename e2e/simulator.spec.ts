import { expect, test } from "@playwright/test";

test("a lead is qualified, shortlisted and booked through the WhatsApp simulator", async ({ page }) => {
  await page.goto("/dev/simulator");
  await page.locator("button", { hasText: "Good evening. I saw" }).click();
  await expect(page.getByText(/reply STOP/i).first()).toBeVisible();
  const box = page.getByPlaceholder("Message");
  await box.fill("Rent. My budget is around 6m a year, Lekki Phase 1 or Ikate. Moving by December.");
  await box.press("Enter");
  await page.getByText("Choose a home").click();
  await page.locator("button", { hasText: "3-bed flat, Ikate" }).first().click();
  await expect(page.getByText(/viewing of the 3-bed flat, Ikate|open to view the 3-bed flat, Ikate/)).toBeVisible();
  await page.locator("div.grid.border-t button").first().click();
  await expect(page.getByText(/confirmed|Booked/).first()).toBeVisible();
  await expect(page.getByText("viewing_booked")).toBeVisible();
});
