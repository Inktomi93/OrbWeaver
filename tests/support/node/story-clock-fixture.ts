import type { PluginSurfaceRegistrationMeta } from "@orb/contracts/plugin";
import { pluginSurfaceRegistrationMetaSchema } from "@orb/contracts/plugin";
import { bootShowcase } from "../showcase-guest.ts";

/** Captures the actual authored surfaces and their empty-room publication. */
export async function storyClockFixture(): Promise<{
  readonly surfaces: readonly PluginSurfaceRegistrationMeta[];
  readonly state: Readonly<Record<string, unknown>>;
}> {
  const surfaces: PluginSurfaceRegistrationMeta[] = [];
  let state: Readonly<Record<string, unknown>> = {};
  const opened: (() => Promise<void>)[] = [];
  await bootShowcase("story-clocks", {
    grants: ["ui.surface", "chat.read", "chat.variables.write", "events.subscribe"],
    log: { info: (): void => undefined, warn: (): void => undefined },
    chat: { current: (): string => "room", getVariables: (): Promise<Record<string, string>> => Promise.resolve({}) },
    events: {
      on: (_event: string, handler: () => Promise<void>): void => {
        opened.push(handler);
      },
    },
    ui: {
      register: (registration: PluginSurfaceRegistrationMeta): void => {
        surfaces.push(pluginSurfaceRegistrationMetaSchema.parse(registration));
      },
      setState: (_surfaceId: string, publication: Readonly<Record<string, unknown>>): Promise<void> => {
        state = publication;
        return Promise.resolve();
      },
    },
  });
  for (const handler of opened) {
    await handler();
  }
  return { surfaces, state };
}
