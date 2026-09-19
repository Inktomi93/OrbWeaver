// seed's programmatic front door — the three DEV seeders. All of them write through the app's OWN verbs
// (domain services / the canon bulk-import seam / the real HTTP surface), never raw inserts: a successful
// seed run is therefore also a smoke test of the write paths it exercises.
export type { ChatArgs, DemoArgs, MultiUserConfig, RunFullSeedDeps, RunFullSeedResult } from "./contract/types.ts";
export { fakeEmbedding, fakeVllmClient, inertVllmClient } from "./lib/fake-vllm.ts";
export { SECOND_HUMAN_HANDLE } from "./lib/fixture.ts";
export { buildTranscript, parseChatArgs, parseDemoArgs, transcriptFilename } from "./lib/transcript.ts";

// Per-verb LAZY loaders for cli.ts — `demo`/`chat` pull in the server env schema (domain verbs, db);
// `multi-user` only speaks HTTP and must never pay that parse cost (#2407). No EAGER op export lives
// here (an eager `export … from "./ops/<verb>.ts"` would defeat the laziness the instant cli.ts imports
// this barrel), so cli.ts dispatches through these instead of a raw `import("./ops/<verb>.ts")` and stays
// on the one-front-door rule (tooling-cli-via-index) while keeping the per-verb load lazy.
export const loadDemoSeed = (): Promise<typeof import("./ops/demo.ts")> => import("./ops/demo.ts");
export const loadChatSeed = (): Promise<typeof import("./ops/chat.ts")> => import("./ops/chat.ts");
export const loadMultiUserSeed = (): Promise<typeof import("./ops/multi-user.ts")> => import("./ops/multi-user.ts");
