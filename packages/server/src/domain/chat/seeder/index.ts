// domain/chat/seeder — the EXAMPLE-conversation seeder subsystem barrel (the sibling of
// `domain/character/seeder`). The chat front door re-exports these; entry (boot + the app first-request
// hook) constructs the ONE instance via `createDemoChatSeeder` over chat's own bulk-import write op plus the
// injected transcript read / character lookup / settings latch. The TYPES live in `contract/seeder.ts` (the
// §7.4 one-type-home rule); this barrel re-exports them alongside the factory + the manifest constants.

export type {
  DemoChat,
  DemoChatActorSeat,
  DemoChatGame,
  DemoChatGameActor,
  DemoChatGameSetup,
  DemoChatSeat,
  DemoChatSeeder,
  DemoChatSeederDeps,
  SeededChatDressing,
} from "../contract/seeder.ts";
export { DEMO_CHAT_NARRATOR_NAME, DEMO_CHAT_PACK_VERSION, DEMO_CHAT_TITLE_PREFIX, DEMO_CHATS } from "./demo-chats.ts";
export { createDemoChatSeeder } from "./seed.ts";
