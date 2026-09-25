// foundation/env/refusal — the refused env parse as the operator reads it: every refused key named by its path, an
// issue with no key still carried, and never the parser's JSON dump.

import { COOKIE_AUTH_MODES } from "@orb/contracts/identity";
import { z } from "zod";
import { EnvRefusedError, formatEnvRefusal } from "../../../../../packages/server/src/foundation/env/refusal/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const WHOLE_ENV_MESSAGE = "oidc needs its issuer";

const schema = z.object({ port: z.coerce.number().positive(), mode: z.enum(COOKIE_AUTH_MODES) }).superRefine((value, ctx) => {
  if (value.mode === "oidc") {
    ctx.addIssue({ code: "custom", message: WHOLE_ENV_MESSAGE });
  }
});

function refusalOf(raw: Record<string, string>): z.ZodError {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    throw new Error("expected the parse to refuse");
  }
  return parsed.error;
}

test("every refused key is named by its path", () => {
  const refusal = formatEnvRefusal(refusalOf({ port: "0", mode: "bogus" }));
  expect(refusal).toContain("port");
  expect(refusal).toContain("mode");
});

test("an issue with no key path is still carried", () => {
  expect(formatEnvRefusal(refusalOf({ port: "8788", mode: "oidc" }))).toContain(WHOLE_ENV_MESSAGE);
});

test("the thrown error carries the refusal alone, with no JSON issue dump", () => {
  const error = new EnvRefusedError(refusalOf({ port: "0", mode: "local" }));
  expect(error.name).toBe("EnvRefusedError");
  expect(error.message).toContain("port");
  expect(error.message).not.toContain('"code"');
});
