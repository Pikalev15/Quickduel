import { describe, expect, it } from "vitest";
import { safeRelativeRedirect } from "./safe-redirect";

describe("safeRelativeRedirect", () => {
  it("keeps internal paths and query strings", () => {
    expect(safeRelativeRedirect("/profile/settings?tab=account")).toBe("/profile/settings?tab=account");
  });

  it.each(["/\\evil.com", "//evil.com", "https://evil.com", "javascript:alert(1)", null])(
    "rejects an unsafe redirect: %s",
    (value) => {
      expect(safeRelativeRedirect(value)).toBe("/");
    },
  );
});
