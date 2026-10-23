// domain/automation/watcher — startAutomationWatcher: the supervised out-of-band lifecycle (the buddy-observer
// / agents-scheduler precedent — 01 §3). NOT a service verb. The composition root calls it once with the
// assembled env; it wires the two injected event sources (the per-chat firehose + the domain-event bus) to the
// service's `handleEvent` front door and returns stop() (run on SIGTERM). The subsystem stays DUMB: every
// event is handed to `handleEvent`, which owns the pre-check, taxonomy filter, fact resolution, and dispatch.
// Fire-and-forget — `handleEvent` is self-safe (never throws), so a rule failure never reaches this loop.
// The per-viewer `chatOpened` trigger is NOT on either bus (D81 — a transport-attach synthesis); it is tapped
// separately at the composition root and fed to the same `handleEvent`.

import type { AutomationWatcherEnv, AutomationWatcherHandle } from "../contract/service.ts";

/** Start the automation watcher. Idempotent teardown via the returned stop(). */
export function startAutomationWatcher(env: AutomationWatcherEnv): AutomationWatcherHandle {
  using construction = new DisposableStack();
  const { supervise, newOpaqueId } = env;
  const unsubChat = env.onChatEvent((event) => {
    supervise(`automation:chat:${event.chatId}:${event.type}:${newOpaqueId()}`, "automation.handleEvent", { eventType: event.type }, () =>
      env.automation.handleEvent(event),
    );
  });
  construction.defer(unsubChat);
  const unsubDomain = env.onDomainEvent((event) => {
    supervise(`automation:domain:${event.type}:${newOpaqueId()}`, "automation.handleEvent", { eventType: event.type }, () => env.automation.handleEvent(event));
  });

  construction.defer(unsubDomain);
  const lifetime = construction.move();
  let stopped = false;
  return {
    stop: (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      lifetime.dispose();
    },
  };
}
