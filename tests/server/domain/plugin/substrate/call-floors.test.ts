// The per-plugin call floors that bound a plugin's egress, spend and notices: a claim is one synchronous
// check-and-record step, a window releases on the injected clock, and one plugin's budget never touches another's.
// @subject packages/server/src/domain/plugin/substrate/rate-floor.ts
// @subject packages/server/src/domain/plugin/substrate/notify-floor.ts

import { AUTOMATION_NOTICE_COOLDOWN_SECONDS } from "@orb/contracts/notifications";
import { mintTypeId } from "@orb/kit/ids";
import { MS_PER_HOUR, MS_PER_SECOND } from "@orb/kit/time";
import { createNotifyFloor, createPluginRateFloor } from "@orb/server/domain/plugin";
import { createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const LIMIT = 3;
const COOLDOWN_MS = AUTOMATION_NOTICE_COOLDOWN_SECONDS * MS_PER_SECOND;

test("the hourly floor refuses the call past its limit and releases when the hour rolls over", () => {
  const clock = createFrozenClock();
  const floor = createPluginRateFloor(() => clock.now(), { capability: "llm.quiet", limit: LIMIT });
  const plugin = mintTypeId("plugin");

  for (let call = 0; call < LIMIT; call += 1) {
    expect(() => floor.admit(plugin)).not.toThrow();
  }
  expect(() => floor.admit(plugin)).toThrow(`llm.quiet is limited to ${String(LIMIT)} calls per hour`);

  clock.advance(MS_PER_HOUR - 1);
  expect(() => floor.admit(plugin)).toThrow();
  clock.advance(1);
  expect(() => floor.admit(plugin)).not.toThrow();
});

test("each plugin has its own hourly budget", () => {
  const floor = createPluginRateFloor(() => 0, { capability: "net.fetch", limit: 1 });
  const first = mintTypeId("plugin");
  const second = mintTypeId("plugin");

  floor.admit(first);
  expect(() => floor.admit(first)).toThrow();
  expect(() => floor.admit(second)).not.toThrow();
});

test("the notice floor spaces one plugin's notices per chat and releases at the cooldown", () => {
  const clock = createFrozenClock();
  const floor = createNotifyFloor(() => clock.now());
  const plugin = mintTypeId("plugin");
  const chat = mintTypeId("chat");

  floor.admit(plugin, chat);
  expect(() => floor.admit(plugin, chat)).toThrow();
  clock.advance(COOLDOWN_MS - 1);
  expect(() => floor.admit(plugin, chat)).toThrow();
  clock.advance(1);
  expect(() => floor.admit(plugin, chat)).not.toThrow();
});

test("a notice in one room or from one plugin never mutes another pair", () => {
  const floor = createNotifyFloor(() => 0);
  const plugin = mintTypeId("plugin");
  const otherPlugin = mintTypeId("plugin");
  const chat = mintTypeId("chat");
  const otherChat = mintTypeId("chat");

  floor.admit(plugin, chat);
  expect(() => floor.admit(plugin, otherChat)).not.toThrow();
  expect(() => floor.admit(otherPlugin, chat)).not.toThrow();
  expect(() => floor.admit(plugin, chat)).toThrow();
});
