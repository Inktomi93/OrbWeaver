import type { Logger } from "#foundation/observability";
import { createAutomationBus } from "./automation-bus.ts";
import { createChatOpenTap } from "./automation-chat-open-tap.ts";
import { createChatEventsBus } from "./chat-events-bus.ts";
import type { LiveBuses } from "./contract/live-buses.ts";
import { createNotificationsBus } from "./notifications-bus.ts";
import { createQuietFanout } from "./quiet-fanout.ts";
import { createUserEventsBus } from "./user-events-bus.ts";

/** Own every live channel and the chat-open tap of one production application graph. */
export function createLiveBuses(sources: Pick<LiveBuses, "rpg" | "workloads">, logger: Logger): LiveBuses {
  using construction = new DisposableStack();
  // biome-ignore lint/nursery/useDisposables: construction.move transfers this owner to returned LiveBuses; local using would close it before graph use.
  const quiet = construction.use(createQuietFanout());
  // biome-ignore lint/nursery/useDisposables: construction.move transfers this owner to returned LiveBuses; local using would close it before graph use.
  const user = construction.use(createUserEventsBus(quiet.silenceUserEvent));
  const notifications = construction.use(createNotificationsBus());
  // biome-ignore lint/nursery/useDisposables: construction.move transfers this owner to returned LiveBuses; local using would close it before graph use.
  const automation = construction.use(createAutomationBus());
  const chat = construction.use(createChatEventsBus(logger));
  // biome-ignore lint/nursery/useDisposables: construction.move transfers this owner to returned LiveBuses; local using would close it before graph use.
  const chatOpen = construction.use(createChatOpenTap());
  const lifetime = construction.move();
  return { ...sources, quiet, user, notifications, automation, chat, chatOpen, [Symbol.dispose]: () => lifetime.dispose() };
}
