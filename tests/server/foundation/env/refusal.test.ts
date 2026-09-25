// foundation/env/refusal — the refused env parse as the operator reads it: one line per refused key, keyed by its
// path, the whole environment named when an issue has no key, and never the parser's JSON dump.

import { z } from "zod";
import { EnvRefusedError, formatEnvRefusal } from "../../../../packages/server/src/foundation/env/refusal.ts";
import { expect, test } from "../../../support/fixtures.ts";

const schema = z.object({ port: z.coerce.number().positive(), mode: z.enum(["local", "oidc"]) }).superRefine((value, ctx) => {
  if (value.mode === "oidc") {
    ctx.addIssue({ code: "custom", message: "oidc needs its issuer" });
  }
});

function refusalOf(raw: Record<string, string>): z.ZodError {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    throw new Error("expected the parse to refuse");
  }
  return parsed.error;
}

test("each refused key is its own line, named by its path", () => {
  const lines = formatEnvRefusal(refusalOf({ port: "0", mode: "bogus" })).split("\n");
  expect(lines).toHaveLength(2);
  expect(lines.some((line) => line.includes("port"))).toBe(true);
  expect(lines.some((line) => line.includes("mode"))).toBe(true);
});

test("a refusal with no key path names the whole environment", () => {
  expect(formatEnvRefusal(refusalOf({ port: "8788", mode: "oidc" }))).toContain("environment");
});

test("the thrown error carries the lines alone, with no JSON issue dump", () => {
  const error = new EnvRefusedError(refusalOf({ port: "0", mode: "local" }));
  expect(error.name).toBe("EnvRefusedError");
  expect(error.message).toContain("port");
  expect(error.message).not.toContain('"code"');
});
