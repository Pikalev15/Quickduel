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

test("Memory Grid flashes briefly, holds the blank board, then unlocks", async ({
  page,
}) => {
  await page.goto("/match/practice?game=memory_grid&seed=memory-retention");
  const board = page.locator(".memory-board");
  const cells = board.getByRole("button");
  const activeCells = board.locator("button.is-active");
  await expect(activeCells).toHaveCount(6, { timeout: 10_000 });

  await expect(activeCells).toHaveCount(0, { timeout: 2_000 });
  await expect(page.getByText(/^Hold · \d\.\ds$/)).toBeVisible();
  await expect(cells.first()).toBeDisabled();

  await expect(page.getByText(/^Hold · \d\.\ds$/)).toHaveCount(0, {
    timeout: 3_000,
  });
  await expect(cells.first()).toBeEnabled();
  await cells.first().click();
  await expect(cells.first()).toHaveAttribute("aria-pressed", "true");
});

test("Frequency Recall v2 gives per-round feedback before advancing", async ({ page }) => {
  await page.goto("/match/practice?game=frequency_recall_v2&seed=frequency-feedback");
  const confirm = page.getByRole("button", { name: "Confirm round" });
  await expect(confirm).toBeVisible({ timeout: 8_000 });
  await confirm.click();
  await expect(page.getByText("Round score", { exact: true })).toBeVisible();
  await expect(page.getByText("Target", { exact: true })).toBeVisible();
  await expect(page.getByText("Your guess", { exact: true })).toBeVisible();
  await expect(page.getByText("Difference", { exact: true })).toBeVisible();
  await expect(page.getByText("Percent", { exact: true })).toBeVisible();
  await expect(page.getByText("Cents", { exact: true })).toBeVisible();
  await expect(page.getByText("Bot round", { exact: true })).toBeVisible();
  await expect(page.getByText("Bot total", { exact: true })).toBeVisible();
  await expect(page.getByText("Next round in 2 seconds")).toBeVisible();
  await expect(page.getByText("Round 2 of 5")).toBeVisible({ timeout: 3_000 });
});

test("Colour Recall v2 compares both swatches and wrapped colour metrics", async ({ page }) => {
  await page.goto("/match/practice?game=colour_recall_v2&seed=colour-feedback");
  const confirm = page.getByRole("button", { name: "Confirm round" });
  await expect(confirm).toBeVisible({ timeout: 8_000 });
  await confirm.click();
  await expect(page.getByText("Round score", { exact: true })).toBeVisible();
  await expect(page.getByText("Distance", { exact: true })).toBeVisible();
  await expect(page.getByText("Lightness", { exact: true })).toBeVisible();
  await expect(page.getByText("Chroma", { exact: true })).toBeVisible();
  await expect(page.getByText("Hue · wrapped", { exact: true })).toBeVisible();
  await expect(page.getByText("Bot round", { exact: true })).toBeVisible();
  await expect(page.locator(".colour-feedback-swatches i")).toHaveCount(2);
  await expect(page.getByText("Round 2 of 5")).toBeVisible({ timeout: 3_000 });
});

test("ranked recall restores authoritative feedback after a reload", async ({ page }) => {
  const matchId = "00000000-0000-4000-8000-000000000099";
  const startsAt = new Date(Date.now() - 2_000).toISOString();
  await page.route(`**/api/matches/${matchId}`, (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          id: matchId,
          status: "active",
          game_type: "frequency_recall_v2",
          game_version: 2,
          ranked: true,
          phase: "answer",
          challenge: {},
          reveal_duration_ms: 0,
          answer_duration_ms: 30_000,
          starts_at: startsAt,
          expires_at: new Date(Date.now() + 30_000).toISOString(),
          winner_id: null,
          completed_at: null,
          rematch_match_id: null,
          current_user_id: profile.id,
          players: [
            {
              user_id: profile.id,
              display_name: "Levi",
              ready_at: startsAt,
              submitted_at: null,
              calculated_score: null,
              correct_count: null,
              incorrect_count: null,
              completion_time_ms: null,
              rating_before: 1184,
              rating_after: null,
              rating_delta: null,
              rematch_requested_at: null,
              result: null,
            },
            {
              user_id: "00000000-0000-4000-8000-000000000002",
              display_name: "Opponent",
              ready_at: startsAt,
              submitted_at: null,
              calculated_score: null,
              correct_count: null,
              incorrect_count: null,
              completion_time_ms: null,
              rating_before: 1172,
              rating_after: null,
              rating_delta: null,
              rematch_requested_at: null,
              result: null,
            },
          ],
        },
      },
    }),
  );
  await page.route(`**/api/matches/${matchId}/round`, (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          gameId: "frequency_recall_v2",
          roundIndex: 2,
          roundCount: 5,
          phase: "feedback",
          phaseEndsAt: new Date(Date.now() + 30_000).toISOString(),
          target: 440,
          ownAnswer: 466,
          feedback: {
            kind: "frequency",
            targetHz: 440,
            guessHz: 466,
            differenceHz: 26,
            percentError: 5.909,
            centsError: 99.367,
            direction: "high",
            score: 9.449,
            label: "Very close",
          },
          ownSubmitted: true,
          opponentSubmitted: true,
          ownScore: 27.4,
          opponentScore: 24.8,
        },
      },
    }),
  );
  await page.route(`**/api/matches/${matchId}/chat**`, (route) =>
    route.fulfill({ json: { ok: true, data: [] } }),
  );

  await page.goto(`/match/${matchId}`);
  await expect(page.getByText("440 Hz", { exact: true })).toBeVisible();
  await expect(page.getByText("466 Hz", { exact: true })).toBeVisible();
  await expect(page.getByText(/You 27.4 · Opponent 24.8/)).toBeVisible();
  await expect(page.getByText("Opponent guess", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("440 Hz", { exact: true })).toBeVisible();
  await expect(page.getByText("Round 3 of 5")).toBeVisible();
  await expect(page.getByText(/You 27.4 · Opponent 24.8/)).toBeVisible();
});

test("Target Tap ignores status text but counts genuine background misses", async ({ page }) => {
  await page.goto("/match/practice?game=target_tap&seed=target-tap-regression");
  const field = page.locator(".target-field");
  const status = field.getByText(/0\/12 targets · 0 misses/);
  await expect(field).toBeVisible({ timeout: 10_000 });
  await expect(status).toBeVisible();

  const statusBox = await status.boundingBox();
  expect(statusBox).not.toBeNull();
  await page.mouse.click(
    statusBox!.x + statusBox!.width / 2,
    statusBox!.y + statusBox!.height / 2,
  );
  await expect(status).toHaveText("0/12 targets · 0 misses");

  const emptyPoint = await field.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const target = element.querySelector("button")?.getBoundingClientRect();
    const overlay = element.querySelector("span")?.getBoundingClientRect();
    const candidates = [
      [bounds.left + bounds.width - 20, bounds.top + bounds.height - 20],
      [bounds.left + 20, bounds.top + 20],
      [bounds.left + bounds.width / 2, bounds.top + bounds.height - 20],
    ];
    const outside = (point: number[], rectangle?: DOMRect) =>
      !rectangle ||
      point[0] < rectangle.left ||
      point[0] > rectangle.right ||
      point[1] < rectangle.top ||
      point[1] > rectangle.bottom;
    return candidates.find(
      (point) => outside(point, target) && outside(point, overlay),
    ) ?? candidates[0];
  });
  await page.mouse.click(emptyPoint[0], emptyPoint[1]);
  await expect(field.getByText(/0\/12 targets · 1 misses/)).toBeVisible();
});

test("Typing Sprint is keyboard-first, blocks paste, and submits at the deadline", async ({
  page,
}, testInfo) => {
  await page.goto("/match/practice?game=typing_sprint&seed=typing-sprint-e2e");
  const surface = page.locator(".typing-sprint");
  const input = page.getByLabel("Type the displayed words");
  await expect(surface).toBeVisible({ timeout: 10_000 });
  await expect(input).toBeFocused();

  const pastePrevented = await input.evaluate((element) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    return !element.dispatchEvent(event);
  });
  expect(pastePrevented).toBe(true);

  const firstWord = await page.locator(".typing-word").first().textContent();
  expect(firstWord?.length).toBeGreaterThan(2);
  await page.keyboard.type(firstWord!.slice(0, 2));
  await expect(page.locator(".typing-word").first().locator(".is-correct")).toHaveCount(2);

  const expectedThird = firstWord![2];
  const wrongCharacter = expectedThird === "z" ? "a" : "z";
  await page.keyboard.type(wrongCharacter);
  await expect(page.locator(".typing-word").first().locator(".is-incorrect")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(page.locator(".typing-word").first().locator(".is-incorrect")).toHaveCount(0);
  await page.keyboard.type(`${firstWord!.slice(2)} `);
  await expect(page.locator(".typing-word.is-current")).not.toHaveText(firstWord!);
  await expect(page.locator(".typing-word.is-current .is-caret")).toHaveCount(1);
  await captureProductScreenshot(page, testInfo, "typing-sprint-active");

  await expect(page.getByRole("heading", { name: /Victory|Defeat|Draw/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Typing Sprint ranks net WPM. Errors reduce your score.")).toBeVisible();
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
              completion_reason: "timeout_forfeit",
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
  await expect(page.getByText("Timeout forfeit")).toBeVisible();
});

test("timeout result is not presented as an accuracy win and match chat stays scoped", async ({
  page,
}, testInfo) => {
  const matchId = "00000000-0000-4000-8000-000000000099";
  const playerId = "00000000-0000-4000-8000-000000000001";
  const opponentId = "00000000-0000-4000-8000-000000000002";
  await page.route(`**/api/matches/${matchId}`, (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          id: matchId,
          status: "completed",
          game_type: "memory_grid",
          game_version: 1,
          ranked: true,
          phase: "result",
          challenge: {},
          reveal_duration_ms: 1750,
          answer_duration_ms: 8000,
          starts_at: new Date(Date.now() - 20_000).toISOString(),
          expires_at: new Date(Date.now() - 5_000).toISOString(),
          winner_id: playerId,
          completed_at: new Date().toISOString(),
          completion_reason: "timeout_forfeit",
          rematch_match_id: null,
          current_user_id: playerId,
          players: [
            {
              user_id: playerId,
              display_name: "Levi",
              ready_at: new Date().toISOString(),
              submitted_at: new Date().toISOString(),
              calculated_score: 100,
              correct_count: 6,
              incorrect_count: 0,
              completion_time_ms: 1800,
              rating_before: 1000,
              rating_after: 1016,
              rating_delta: 16,
              rematch_requested_at: null,
              result: {
                rankScore: 100,
                accuracy: 1,
                summary: "6 remembered",
                details: { correct: 6 },
              },
            },
            {
              user_id: opponentId,
              display_name: "Nova",
              ready_at: new Date().toISOString(),
              submitted_at: null,
              calculated_score: -999999,
              correct_count: 0,
              incorrect_count: 0,
              completion_time_ms: 8000,
              rating_before: 1000,
              rating_after: 984,
              rating_delta: -16,
              rematch_requested_at: null,
              result: {
                rankScore: -999999,
                accuracy: 0,
                summary: "No answer",
                details: { timedOut: true },
              },
            },
          ],
        },
      },
    }),
  );
  await page.route(`**/api/matches/${matchId}/chat`, (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: [{
          id: "00000000-0000-4000-8000-000000000199",
          sender_id: opponentId,
          sender_name: "Nova",
          body: "gg",
          created_at: new Date().toISOString(),
        }],
      },
    }),
  );
  await page.goto(`/match/${matchId}`);
  await expect(page.getByRole("heading", { name: "Victory" })).toBeVisible();
  await expect(page.getByText("Opponent failed to submit. Win by forfeit.")).toBeVisible();
  await expect(page.getByText("Match chat")).toBeVisible();
  await expect(page.getByText("Only this 1v1 · kept 7 days")).toBeVisible();
  await expect(page.getByText("gg", { exact: true })).toBeVisible();
  await expect(page.getByText(/accuracy victory/i)).toHaveCount(0);
  await captureProductScreenshot(page, testInfo, "ranked-timeout-chat");
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
            frequency_recall_v2: {
              played: 5,
              wins: 3,
              losses: 2,
              draws: 0,
              best_rank_score: 44,
              best_time_ms: 2200,
              total_rank_score: 190,
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
  await expect(page.getByText("Average score out of 50")).toBeVisible();
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
  await expect(page.getByText("Speed usually breaks ties.")).toBeVisible();
  await expect(page.getByText(/Typing Sprint ranks net WPM directly/i)).toBeVisible();
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
