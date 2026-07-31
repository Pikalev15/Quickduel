import { describe, expect, it } from "vitest";
import {
  databaseDomainCode,
  isDuplicateSubmission,
} from "./domain-errors";

describe("database domain errors", () => {
  it("uses the stable detail code and ignores prose changes", () => {
    const first = {
      code: "P0001",
      message: "Answer already submitted.",
      details: "QD_DUPLICATE_SUBMISSION",
    };
    const rewritten = {
      code: "P0001",
      message: "That response was previously locked.",
      details: "QD_DUPLICATE_SUBMISSION",
    };
    expect(databaseDomainCode(first)).toBe("QD_DUPLICATE_SUBMISSION");
    expect(databaseDomainCode(rewritten)).toBe("QD_DUPLICATE_SUBMISSION");
    expect(isDuplicateSubmission(first)).toBe(true);
    expect(isDuplicateSubmission(rewritten)).toBe(true);
  });

  it("does not classify arbitrary database prose", () => {
    expect(databaseDomainCode({
      code: "P0001",
      message: "already maybe perhaps",
      details: "implementation detail changed",
    })).toBeNull();
  });
});
