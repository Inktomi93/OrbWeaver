// seed's programmatic front door — the three DEV seeders. All of them write through the app's OWN verbs
// (domain services / the canon bulk-import seam / the real HTTP surface), never raw inserts: a successful
// seed run is therefore also a smoke test of the write paths it exercises.
export type { ChatArgs, DemoArgs, MultiUserConfig, RunFullSeedDeps, RunFullSeedResult } from "./contract/types.ts";
export { fakeEmbedding, fakeVllmClient, inertVllmClient } from "./lib/fake-vllm.ts";
export { SECOND_HUMAN_HANDLE } from "./lib/fixture.ts";
export { buildTranscript, parseChatArgs, parseDemoArgs, transcriptFilename } from "./lib/transcript.ts";
export { runChatSeed } from "./ops/chat.ts";
export { resolveSeedVllmDisabled, runDemoSeed, runFullSeed } from "./ops/demo.ts";
export { multiUserConfig, runMultiUserSeed } from "./ops/multi-user.ts";
