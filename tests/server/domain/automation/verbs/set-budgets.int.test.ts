// verb: setBudgets — upsert the per-chat fire-rate cap (host-only); a re-set updates it, and the cap has a
// CEILING (#1430).

import { AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR } from "@orb/contracts/automation";
import { DomainOperationError } from "@orb/kit/errors";
import { expect, test } from "../../../../support/fixtures.ts";
import { principal, ruleFixture } from "../_support.ts";

/** The typed refusal's machine CODE, or "resolved" when the call did not refuse at all.
 *
 *  Asserted as a CODE rather than by importing the error class, deliberately: the code is what the transport
 *  maps and what an editor surfaces, and asserting it keeps this pin RUNNABLE against a tree that does not
 *  have the class yet — which is what makes the red-first receipt a DEFECT proof ("it resolved") rather than
 *  a module that failed to load. */
async function refusalCode(op: Promise<unknown>): Promise<string> {
  try {
    await op;
  } catch (err) {
    return err instanceof DomainOperationError ? err.code : `not-a-domain-error: ${String(err)}`;
  }
  return "resolved";
}

test("setBudgets upserts the fire-rate cap and a re-set updates it", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await expect(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 5 })).resolves.toBeUndefined();
  await expect(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 9 })).resolves.toBeUndefined();
});

// #1430 — A BELT WITH NO TOP IS NOT A BELT. The per-rule cap has been 0..240 since v1; this plane took
// whatever arrived, so a host could set a nine-digit ceiling that bounds nothing while the panel read as
// configured. The bound is the VERB's (compose reaches it without the transport), so it is asserted here.
test("a cap ABOVE the ceiling is refused and nothing is written", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 60 });
  expect(await refusalCode(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR + 1 }))).toBe(
    "automation_budget_invalid",
  );
  // The refusal precedes the upsert — the previously stored cap stands.
  await expect(svc.getBudgets({ principal: principal(host), chatId })).resolves.toEqual({ maxFiresPerHour: 60 });
});

test("the ceiling itself is admitted, and so are 0 and an omitted field", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await expect(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR })).resolves.toBeUndefined();
  await expect(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 0 })).resolves.toBeUndefined();
  // Absent = "keep the current value", the verb's documented patch semantics — never a validation target.
  await expect(svc.setBudgets({ principal: principal(host), chatId })).resolves.toBeUndefined();
  await expect(svc.getBudgets({ principal: principal(host), chatId })).resolves.toEqual({ maxFiresPerHour: 0 });
});

// The LATENT half of #1430: negative/fractional/NaN cannot reach the verb through the tRPC schema, but the
// verb is reachable from compose without it, so the bound is total rather than a mirror of the wire's.
test("a NEGATIVE, FRACTIONAL or NaN cap is refused at the verb, not only at the wire", async () => {
  const { host, chatId, svc } = await ruleFixture();
  for (const cap of [-1, 1.5, Number.NaN]) {
    expect(await refusalCode(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: cap }))).toBe("automation_budget_invalid");
  }
});
