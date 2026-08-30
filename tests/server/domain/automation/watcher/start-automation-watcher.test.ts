// watcher/start-automation-watcher — the supervised out-of-band lifecycle. Pure (fake event sources + a
// capturing `automation.handleEvent`). Pins: BOTH bus taps route to the SAME handleEvent front door, stop()
// unsubscribes both, and stop() is idempotent (a double SIGTERM never double-unsubscribes).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { AutomationWatcherEnv } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { startAutomationWatcher } from "../../../../../packages/server/src/domain/automation/watcher/start-automation-watcher.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function fakeEnv(): {
  env: AutomationWatcherEnv;
  fireChat: (event: ChatBusEvent) => void;
  fireDomain: (event: DomainEvent) => void;
  unsubChat: ReturnType<typeof vi.fn>;
  unsubDomain: ReturnType<typeof vi.fn>;
  handled: unknown[];
} {
  let chatHandler: (event: ChatBusEvent) => void = () => undefined;
  let domainHandler: (event: DomainEvent) => void = () => undefined;
  const unsubChat = vi.fn();
  const unsubDomain = vi.fn();
  const handled: unknown[] = [];
  const env: AutomationWatcherEnv = {
    onChatEvent: (handler): (() => void) => {
      chatHandler = handler;
      return unsubChat;
    },
    onDomainEvent: (handler): (() => void) => {
      domainHandler = handler;
      return unsubDomain;
    },
    automation: {
      handleEvent: (event): Promise<void> => {
        handled.push(event);
        return Promise.resolve();
      },
    },
  };
  return {
    env,
    fireChat: (event): void => chatHandler(event),
    fireDomain: (event): void => domainHandler(event),
    unsubChat,
    unsubDomain,
    handled,
  };
}

test("both bus taps route to the SAME handleEvent front door", async () => {
  const { env, fireChat, fireDomain, handled } = fakeEnv();
  startAutomationWatcher(env);
  fireChat({ type: "chatOpened", chatId: castId<ChatId>("chat_x") });
  fireDomain({ type: "character.updated", characterId: castId<CharacterId>("character_x"), contentChanged: true });
  // superviseDetached is fire-and-forget; give the microtask queue a turn.
  await Promise.resolve();
  await Promise.resolve();
  expect(handled).toHaveLength(2);
});

describe("stop()", () => {
  test("unsubscribes BOTH taps", () => {
    const { env, unsubChat, unsubDomain } = fakeEnv();
    const handle = startAutomationWatcher(env);
    handle.stop();
    expect(unsubChat).toHaveBeenCalledTimes(1);
    expect(unsubDomain).toHaveBeenCalledTimes(1);
  });

  test("is idempotent — a second stop() never double-unsubscribes", () => {
    const { env, unsubChat, unsubDomain } = fakeEnv();
    const handle = startAutomationWatcher(env);
    handle.stop();
    handle.stop();
    expect(unsubChat).toHaveBeenCalledTimes(1);
    expect(unsubDomain).toHaveBeenCalledTimes(1);
  });
});
