import { expect, test, type Page, type TestInfo } from "@playwright/test";

const profile = {
  id: "00000000-0000-4000-8000-000000000001",
  display_name: "Levi",
  public_code: "7A2F1C",
  rating: 1184,
  wins: 12,
  losses: 8,
  draws: 2,
  matches_played: 22,
  rank: 14,
  accent_colour: "volt",
  highest_rating: 1210,
  current_win_streak: 2,
  best_win_streak: 5,
  onboarding_completed: true,
  game_stats: {},
};

async function mockAuthenticatedProfile(page: Page) {
  await page.route("**/api/profile", (route) =>
    route.fulfill({ json: { ok: true, data: profile } }),
  );
}

async function captureProductScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  if (process.env.E2E_CAPTURE_SCREENSHOTS !== "1") return;
  await page.screenshot({
    path: `docs/screenshots/${name}-${testInfo.project.name}.png`,
    fullPage: true,
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/analytics", (route) =>
    route.fulfill({ status: 202, json: { ok: true, data: { accepted: true } } }),
  );
});

test.afterEach(async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("home preserves Quick Play priority and exposes private duels", async ({ page }) => {
  await page.route("**/api/public/overview", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: { leaderboard: [], activity: { online_count: 3 } },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /A quick test of what you notice/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quick play" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Private duel/i })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/overflow/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("private duel lobby exposes safe state and share controls", async ({ page }, testInfo) => {
  await page.route("**/api/duels/7K2M8PAA", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          code: "7K2M8PAA",
          state: "waiting",
          host_name: "Levi",
          guest_name: null,
          selection_kind: "game",
          game_type: "frequency_recall",
          playlist: "sensory",
          best_of: 3,
          ranked: false,
          host_score: 0,
          guest_score: 0,
          current_round: 0,
          current_match_id: null,
          viewer_role: "host",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          completed_at: null,
          rounds: [],
        },
      },
    }),
  );
  await page.goto("/duel/7K2M8PAA");
  await expect(page.getByRole("heading", { name: "Waiting for opponent" })).toBeVisible();
  await expect(page.getByText("Frequency Recall")).toBeVisible();
  await expect(page.getByText("Best of 3")).toBeVisible();
  await expect(page.getByText("Unranked")).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy or share link/i })).toBeVisible();
  await expect(page.getByText(/00000000-0000/)).toHaveCount(0);
  await captureProductScreenshot(page, testInfo, "retention-private-duel");
});

test("history renders cursor page and meaningful game summaries", async ({ page }) => {
  await page.route("**/api/history?*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          items: [
            {
              id: "00000000-0000-4000-8000-000000000009",
              outcome: "win",
              opponent_name: "Nova",
              opponent_code: "ABC123",
              game_type: "frequency_recall",
              ranked: true,
              rating_delta: 17,
              player_summary: "34 pitch-error",
              opponent_summary: "49 pitch-error",
              player_time_ms: 2400,
              opponent_time_ms: 3100,
              completed_at: new Date().toISOString(),
              source: "private_duel",
              private_duel_id: null,
              series_round: 2,
            },
          ],
          next_cursor: null,
        },
      },
    }),
  );
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "Match history" })).toBeVisible();
  await expect(page.getByText("Victory")).toBeVisible();
  await expect(page.getByText("34 pitch-error")).toBeVisible();
  await expect(page.getByText("+17 Elo")).toBeVisible();
  await expect(page.getByText("Private duel · Round 2")).toBeVisible();
});

test("statistics use game-specific metrics and division thresholds", async ({ page }) => {
  await page.route("**/api/stats", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          ...profile,
          recent_form: ["win", "loss", "win"],
          overall: { total_matches: 24, wins: 13, losses: 9, draws: 2 },
          game_stats: {
            frequency_recall: {
              played: 5,
              wins: 3,
              losses: 2,
              draws: 0,
              best_rank_score: -0.1,
              best_time_ms: 2200,
              total_rank_score: -0.75,
              total_time_ms: 15000,
              recent_results: [],
            },
          },
        },
      },
    }),
  );
  await page.goto("/profile/stats");
  await expect(page.getByText("Gold", { exact: true })).toBeVisible();
  await expect(page.getByText("Average proportional pitch error")).toBeVisible();
  await expect(page.getByText(/not measures of intelligence/i)).toBeVisible();
});

test("weekly season communicates UTC timing and anti-farming limit", async ({ page }, testInfo) => {
  await page.route("**/api/seasons", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          id: "2026-W31",
          starts_at: "2026-07-27T00:00:00Z",
          ends_at: "2026-08-03T00:00:00Z",
          status: "active",
          player: { rank: 2, points: 12, wins: 4, losses: 1, draws: 0, matches_counted: 5 },
          leaderboard: [],
        },
      },
    }),
  );
  await page.goto("/seasons");
  await expect(page.getByText(/Monday at 00:00 UTC/i)).toBeVisible();
  await expect(page.getByText(/At most three ranked matches/i)).toBeVisible();
  await captureProductScreenshot(page, testInfo, "retention-season");
});

test("friends supports empty state and exact search", async ({ page }) => {
  await mockAuthenticatedProfile(page);
  await page.route("**/api/friends", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: { friends: [], requests: [], invitations: [], blocked: [] },
      },
    }),
  );
  await page.route("**/api/friends/search?*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: [{ display_name: "Nova", public_code: "ABC123", rating: 1040, status: "online" }],
      },
    }),
  );
  await page.goto("/friends");
  await expect(page.getByText("No friends yet.")).toBeVisible();
  await page.getByLabel("Exact display name or player code").fill("Nova");
  await page.getByRole("button", { name: "Find player" }).click();
  await expect(page.getByText("Nova#ABC123")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
});

test("onboarding is brief, playable, and skippable", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Learn by playing." })).toBeVisible();
  await expect(page.getByText("Accuracy comes first.")).toBeVisible();
  await expect(page.getByText("Speed breaks ties.")).toBeVisible();
  await expect(page.getByText("Ranked games change Elo.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play starter sequence" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip to Quick Play" })).toBeVisible();
});

test("system theme, reduced motion, and keyboard navigation are honored", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("quickduel:theme", "system"));
  await page.goto("/onboarding");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const transitionDuration = await page.locator(".onboarding-rules li").first().evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("account deletion requires deliberate typed confirmation", async ({ page }) => {
  await page.route("**/api/cosmetics", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: [
          {
            id: "accent-volt",
            type: "profile_accent",
            name: "Volt",
            configuration: { colour: "#3157d5" },
            owned: true,
            equipped: true,
          },
        ],
      },
    }),
  );
  await page.goto("/profile/settings");
  const deletion = page.getByRole("button", { name: "Delete my account" });
  await expect(deletion).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(deletion).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(deletion).toBeEnabled();
});

test("logged-out users cannot render the admin surface", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/This page could not be found/i)).toBeVisible();
});

test("shared result has social image and no private payload", async ({ page }) => {
  await page.route("**/api/shares/ABCDEF123456", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          code: "ABCDEF123456",
          game_type: "memory_grid",
          ranked: true,
          completed_at: new Date().toISOString(),
          source: "public_queue",
          series_round: null,
          players: [
            { display_name: "Levi", summary: "6/6 cells", rating_delta: 16, winner: true },
            { display_name: "Nova", summary: "5/6 cells", rating_delta: -16, winner: false },
          ],
        },
      },
    }),
  );
  await page.goto("/share/ABCDEF123456");
  await expect(page.getByRole("heading", { name: "Victory" })).toBeVisible();
  await expect(page.getByRole("img", { name: /QuickDuel Memory Grid result card/i })).toBeVisible();
  await expect(page.getByText(/challenge_seed|submission_json/)).toHaveCount(0);
});
