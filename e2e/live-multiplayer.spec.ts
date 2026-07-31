import { expect, test } from "@playwright/test";

test.describe("live Supabase multiplayer", () => {
  test.skip(
    process.env.E2E_LIVE_SUPABASE !== "1",
    "Set E2E_LIVE_SUPABASE=1 against a disposable migrated Supabase project.",
  );

  test("two independent anonymous users receive one shared Quick Play match", async ({
    browser,
  }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();
    const firstPage = await first.newPage();
    const secondPage = await second.newPage();
    await Promise.all([firstPage.goto("/play"), secondPage.goto("/play")]);
    await Promise.all([
      firstPage.waitForURL(/\/match\/[0-9a-f-]{36}/, { timeout: 45_000 }),
      secondPage.waitForURL(/\/match\/[0-9a-f-]{36}/, { timeout: 45_000 }),
    ]);
    expect(new URL(firstPage.url()).pathname).toBe(new URL(secondPage.url()).pathname);
    await Promise.all([
      expect(firstPage.getByText(/Connected/i).first()).toBeVisible(),
      expect(secondPage.getByText(/Connected/i).first()).toBeVisible(),
    ]);
    await Promise.all([first.close(), second.close()]);
  });

  test("one missing submission becomes one idempotent timeout forfeit", async ({
    browser,
  }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();
    const firstPage = await first.newPage();
    const secondPage = await second.newPage();
    await Promise.all([firstPage.goto("/play"), secondPage.goto("/play")]);
    await Promise.all([
      firstPage.waitForURL(/\/match\/[0-9a-f-]{36}/, { timeout: 45_000 }),
      secondPage.waitForURL(/\/match\/[0-9a-f-]{36}/, { timeout: 45_000 }),
    ]);
    await expect(firstPage.getByText(/Ranked duel/i)).toBeVisible({ timeout: 20_000 });
    await second.close();
    const submit = firstPage.getByRole("button", { name: "Lock answer" });
    if (await submit.isVisible()) await submit.click();
    await expect(
      firstPage.getByText("Opponent failed to submit. Win by forfeit."),
    ).toBeVisible({ timeout: 90_000 });
    const ratingText = await firstPage.getByText(/→/).textContent();
    await firstPage.reload();
    await expect(
      firstPage.getByText("Opponent failed to submit. Win by forfeit."),
    ).toBeVisible();
    expect(await firstPage.getByText(/→/).textContent()).toBe(ratingText);
    await first.close();
  });
});
