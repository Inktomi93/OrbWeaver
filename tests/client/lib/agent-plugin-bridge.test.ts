// Unit: `readAutomationFires` — the `__orb.automationFires(filter?)` read. It must build EXACTLY the debug
// route's query (only the filters given, branded ids verbatim), read same-origin (the dev admin session is the
// credential), hand the body back on 2xx, and turn a gate refusal into `{ok:false, reason}` naming the status —
// never a throw into a devtools eval.

import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { vi } from "vitest";
import { AUTOMATION_FIRES_ROUTE, readAutomationFires } from "../../../packages/client/src/lib/agent-plugin-bridge.ts";
import { expect, test } from "../../support/fixtures.ts";

const OK = 200;
const UNAUTHORIZED = 401;

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: status >= OK && status < 300, status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

test("no filter reads the bare route same-origin and returns the body", async () => {
  const fetchSpy = stubFetch(OK, { count: 1, fires: [{ id: "automation_fire_x" }] });
  await expect(readAutomationFires()).resolves.toEqual({ count: 1, fires: [{ id: "automation_fire_x" }] });
  expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(AUTOMATION_FIRES_ROUTE, { credentials: "same-origin" });
});

test("every given filter rides the query verbatim; an omitted one is absent, never `undefined`", async () => {
  const fetchSpy = stubFetch(OK, { count: 0, fires: [] });
  await readAutomationFires({ chatId: castId<ChatId>("chat_a"), ruleId: castId<AutomationRuleId>("automation_rule_r"), limit: 5 });
  expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(`${AUTOMATION_FIRES_ROUTE}?chatId=chat_a&ruleId=automation_rule_r&limit=5`, { credentials: "same-origin" });
  fetchSpy.mockClear();
  await readAutomationFires({ chatId: castId<ChatId>("chat_b") });
  expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(`${AUTOMATION_FIRES_ROUTE}?chatId=chat_b`, { credentials: "same-origin" });
});

test("a gate refusal is a loud `{ok:false}` naming the status, not a throw", async () => {
  stubFetch(UNAUTHORIZED, { error: "unauthorized" });
  await expect(readAutomationFires()).resolves.toMatchObject({ ok: false, reason: expect.stringContaining("HTTP 401") });
});
