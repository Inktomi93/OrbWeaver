// The Settings groups' mount reads on a fresh server, taken with the requests the client sends.
import { seedThemes } from "@orb/server/entry/boot";
import type { CorpusFirstBoot } from "../iso/corpus.ts";
import { firstBootInput } from "../iso/corpus-first-boot.ts";
import { bootGrantFor } from "./boot-grant.ts";
import { createServerHarness } from "./server.ts";

/** A server of its own: the corpus graph already holds a second account, connections and themes a first boot does not. */
export async function captureCorpusFirstBoot(): Promise<CorpusFirstBoot> {
  await using root = await createServerHarness({ startJobs: false });
  // A deployed server seeds the shipped themes at boot; the harness does not.
  await seedThemes({ db: bootGrantFor(root.db), logger: root.logger, now: root.clock.now });
  const caller = await root.internalCallerFor(root.ownerId);
  const bindingsInput = firstBootInput.bindings();
  const schedulesInput = firstBootInput.schedules();
  const workloadLists = await Promise.all(firstBootInput.workloadLists().map(async (input) => ({ input, output: await caller.workloads.list(input) })));
  return {
    reads: {
      viewer: { input: undefined, output: await caller.sessions.me() },
      settings: { input: undefined, output: await caller.settings.getUserSettings() },
      themes: { input: undefined, output: await caller.settings.listThemes() },
      appSettings: { input: undefined, output: await caller.settings.getAppSettingsWithOverrides() },
      connections: { input: undefined, output: await caller.connection.list() },
      bindings: { input: bindingsInput, output: await caller.connection.listBindings(bindingsInput) },
      providers: { input: undefined, output: await caller.connection.providersAvailable() },
      credentials: { input: undefined, output: await caller.credentials.list() },
      users: { input: undefined, output: await caller.admin.listUsers() },
      schedules: { input: schedulesInput, output: await caller.workloads.listSchedules(schedulesInput) },
      signInMode: { input: undefined, output: await caller.share.signInMode() },
      shareStatus: { input: undefined, output: await caller.share.status() },
      presets: { input: undefined, output: await caller.preset.list() },
      spaceStatus: { input: undefined, output: await caller.search.spaceStatus() },
    },
    workloadLists,
  };
}
