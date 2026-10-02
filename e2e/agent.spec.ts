import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/inbox");
}

test("agent sees the inbox, takes over a chat and replies", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByText("Chiamaka Eze").first()).toBeVisible();
  await page.getByRole("link", { name: /Ngozi Obi/ }).click();
  await expect(page.getByRole("heading", { name: "Ngozi Obi" })).toBeVisible();
  const composer = page.getByPlaceholder(/AI is handling replies/);
  await expect(composer).toBeDisabled();
  await page.getByRole("button", { name: "Take over" }).click();
  const input = page.getByPlaceholder("Type a message as yourself…");
  await expect(input).toBeEnabled();
  await input.fill("Hello Ngozi, Tunde here. I will call you shortly.");
  await input.press("Enter");
  await expect(page.getByText("Hello Ngozi, Tunde here. I will call you shortly.")).toBeVisible();
  await page.getByRole("button", { name: "Resume AI" }).click();
  await expect(page.getByRole("button", { name: "Take over" })).toBeVisible();
});

test("a draft is approved and sent from Approvals", async ({ page }) => {
  await login(page);
  await page.goto("/approvals");
  await expect(page.getByText("Femi Adeyemi").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve and send" }).click();
  // The queue empties and the sent draft moves to "Recent".
  await expect(page.getByText(/No drafts waiting/)).toBeVisible();
  await expect(page.getByText(/sent ·/i).first()).toBeVisible();
});

test("works on a phone: bottom navigation and listings", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await login(page);
  const nav = page.locator("nav.fixed");
  await expect(nav).toBeVisible();
  await nav.getByText("Listings").click();
  await expect(page.getByRole("heading", { name: "Listings" })).toBeVisible();
  await expect(page.getByText("3-bed flat, Ikate").first()).toBeVisible();
  await ctx.close();
});
