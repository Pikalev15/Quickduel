import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260731065547_secure_recall_round_feedback.sql",
  ),
  "utf8",
).toLowerCase();
const matchRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/matches/[matchId]/route.ts"),
  "utf8",
);

describe("secure recall round migration", () => {
  it("creates participant-isolated round tables with one answer per round", () => {
    expect(migration).toContain("create table public.match_rounds");
    expect(migration).toContain("create table public.match_round_submissions");
    expect(migration).toContain("primary key (match_id, round_index, user_id)");
    expect(migration).toContain("round_index between 0 and 4");
    expect(migration).toContain("alter table public.match_rounds enable row level security");
    expect(migration).toContain("alter table public.match_round_submissions enable row level security");
  });

  it("keeps tables and transition RPCs service-only", () => {
    expect(migration).toContain(
      "revoke all on public.match_rounds from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on public.match_round_submissions from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.advance_recall_round(uuid, uuid, smallint, jsonb)\n  to service_role",
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.(advance|submit)_recall_round[\s\S]{0,160}to authenticated/,
    );
  });

  it("hardens every round RPC and wraps transitions in one migration transaction", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    for (const functionName of ["advance_recall_round", "submit_recall_round"]) {
      const start = migration.indexOf(`create or replace function public.${functionName}`);
      const body = migration.slice(start, start + 600);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
    }
  });

  it("resolves on both answers or the server deadline and holds feedback for two seconds", () => {
    expect(migration).toContain("current_time >= round_row.answer_ends_at");
    expect(migration).toContain("if submission_count = 2 then");
    expect(migration).toContain("feedback_ends_at = current_time + interval '2 seconds'");
    expect(migration).toContain("score, timed_out, submitted_at");
    expect(migration).toContain("'label', 'no answer'");
  });

  it("makes identical duplicate answers idempotent and rejects replacements", () => {
    expect(migration).toContain(
      "if existing_answer = submitted_answer then return; end if",
    );
    expect(migration).toContain("qd_duplicate_round_submission");
  });

  it("never returns an opponent answer or future target collection", () => {
    expect(migration).not.toContain("'opponentanswer'");
    expect(migration).not.toContain("'targets'");
    expect(migration).toContain("'opponentsubmitted'");
    expect(migration).toContain("'opponentscore'");
    expect(migration).toContain("'target', exposed_target");
    expect(matchRoute).toContain("isSecureRecallGame(privateMatch.game_type)");
    expect(matchRoute).toMatch(
      /isSecureRecallGame\(privateMatch\.game_type\)\s*\?\s*\{\}/,
    );
  });

  it("preserves partial results while leaving all-round no-shows to match forfeits", () => {
    expect(migration).toContain("if own_real_rounds > 0 then");
    expect(migration).toContain("perform public.finalize_match_outcome_locked(requested_match_id, false)");
    expect(migration).toContain("calculated_score = own_score");
    expect(migration).toContain("'round' || (next_round + 1)::text || 'target'");
    expect(migration).toContain("'round' || (next_round + 1)::text || 'guess'");
  });

  it("publishes recall detail metrics only through completed opt-in shares", () => {
    expect(migration).toContain(
      "where share_code = upper(requested_code)\n    and share_enabled\n    and status = 'completed'",
    );
    expect(migration).toContain(
      "when match_row.game_type in ('frequency_recall_v2', 'colour_recall_v2')",
    );
    expect(migration).toContain("then mp.result_json -> 'details'");
  });
});
