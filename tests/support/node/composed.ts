// The composed door: helpers that load the server graph. Integration files import it behind the setupFiles warm.

// A summarize call is recognised on the provider wire by the production prompt lead.
export { SUMMARIZE_TRANSCRIPT_MARKER } from "@orb/server/domain/chat";
// The production crypto a root's `sessionsCrypto` option defaults to; a suite builds one to spy on before the root closes over it.
export { SessionsCrypto } from "@orb/server/entry/compose";
// A suite reads an exported archive through the production extractor, the same hardened unzip an import meets.
export { extractZip } from "@orb/server/infra/storage/zip";
export { readAccounts } from "./admin/accounts.ts";
export type { AtlasBootOptions, CannedResponse } from "./atlas-guest.ts";
export { bootAtlas, bootAtlasDates, lastAtlasState } from "./atlas-guest.ts";
export { prepareBackupFolder } from "./backup-folder.ts";
export { casOf } from "./cas.ts";
export { readRoomCanon } from "./chat/canon.ts";
export type { StoredAvatar } from "./chat/cast.ts";
export { addCharacter, addPersona, startRoom, storeAvatar } from "./chat/cast.ts";
export type { ChatRoot, ChatRootOptions } from "./chat/composed.ts";
export { createChatRoot } from "./chat/composed.ts";
export {
  assertPrivateCorpusNetwork,
  assertPrivateCorpusOutput,
  assertPrivateCorpusOutputArguments,
  cloneCorpusFixture,
  createCorpusCapsule,
  createCorpusHarness,
  isPrivateCorpusConfigArgument,
  loadCorpusFixture,
  privateCorpusParent,
  publishCorpusFixture,
  rethrowPrivateCorpusFailure,
  writePrivateCorpusFixture,
} from "./corpus.ts";
export {
  CORPUS_ALTERNATE_EMBED_MODEL,
  seedCorpusActors,
  seedCorpusConnections,
  seedEmbeddingConnection,
  seedRecallCorpus,
  seedRecallRoom,
} from "./corpus-actors.ts";
export { captureCookieAuth, seedCorpusAccount } from "./corpus-auth.ts";
export { captureCorpusRead } from "./corpus-capture.ts";
export { createFirstBootHarness } from "./corpus-first-boot.ts";
export {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
export { createCorpusRecipe, prepareCorpusSnapFixture, runCorpusSnapConsumer } from "./corpus-recipe.ts";
export { personasForParticipantsOf, presentHostOf } from "./cross-feature.ts";
export type { CountedDb, HeldDb, HeldStatement, OwnedDb, OwnedFileDb } from "./db.ts";
export { freshCountedDb, freshDb, freshHeldDb, migrationsBefore, migrationsBeforeLatest, ownDb, ownFileDb, SHIPPED_MIGRATIONS } from "./db.ts";
export type { DbFault } from "./db-faults.ts";
export { plantTrigger, refuseWrites, withheldTable } from "./db-faults.ts";
export { createTestEnv } from "./env.ts";
export { makeAssetBytes, seedAsset } from "./factories/asset.ts";
export { seedAutomationRule, seedAutomationTestFires } from "./factories/automation.ts";
export { seedCharacter } from "./factories/character.ts";
export type { TranscriptLine } from "./factories/chat.ts";
export { seedChat, seedChatInvite, seedInvitedChatParticipant, seedTranscript } from "./factories/chat.ts";
export { makeResolvedSecret } from "./factories/credentials.ts";
export type { OwnerRowDamage } from "./factories/damaged-owner.ts";
export { damageOwnerRow } from "./factories/damaged-owner.ts";
export { seedCharacterDistillations } from "./factories/discovery.ts";
export { plantForeignCardBackground, plantForeignRoomBackground, plantForeignSettingsBytes, plantForeignSettingsValue } from "./factories/foreign-build.ts";
export { plantLegacyZeroCanon } from "./factories/legacy-canon.ts";
export { plantLegacyCheckpoint } from "./factories/legacy-checkpoint.ts";
// The memory-backfill room whose provider answers each summarize call, shared by the estimate suites.
export { createMemoryBackfillRoom, MEMORY_BACKFILL_BLOCK_SIZE, memoryBackfillLines } from "./factories/memory-backfill-room.ts";
export { seedMessage } from "./factories/message.ts";
export type { PeerLease } from "./factories/peer-replica.ts";
export { seedPeerLease } from "./factories/peer-replica.ts";
export { seedPersona } from "./factories/persona.ts";
export {
  makePluginBundle,
  PLUGIN_ZIP_MTIME_SECONDS_RANGE,
  seedDistributedPlugin,
  seedInstalledPlugin,
  seedPluginGrant,
} from "./factories/plugin.ts";
export type { GuestOps, GuestRun } from "./factories/plugin-guest.ts";
export { guestRunner, installGuest, installMacroGuest } from "./factories/plugin-guest.ts";
export { seedPreset } from "./factories/preset.ts";
export { seedAdminProvider } from "./factories/provider.ts";
export { seedGlobalRegexScript, seedRegexScript } from "./factories/regex.ts";
export { seedRpgCheckpoint, seedRpgGame } from "./factories/rpg.ts";
export { seedUserSettings } from "./factories/settings.ts";
// The summarizer reply a scripted provider answers a summarize call with.
export { summaryReply } from "./factories/summary-reply.ts";
export { seedCreatedTag } from "./factories/tag.ts";
export { createQueueScanner, seedWorkloadSchedule } from "./factories/workload.ts";
export type { PhysicalPeer, PhysicalPeerFetch } from "./physical-peer.ts";
export { servePhysicalPeer } from "./physical-peer.ts";
export { exportLibrary, imageProvider, restoreBundle, SIGNED_IN_ROUTE, signedInBox, WORKLOAD_DEADLINE_MS } from "./portability-box.ts";
export { connectDevice, isOnline } from "./presence.ts";
export type {
  NativeServerHarnessOptions,
  NativeServerTestHarness,
  ServerHarnessOptions,
  ServerRuntimeTime,
  ServerTestHarness,
  UnclaimedServerTestHarness,
} from "./server.ts";
export { configureOidc, createServerHarness, SECRET_BOX_TEST_KEY } from "./server.ts";
export { claimShareOwner, readRelayStarts, relayExecutable, relayProgram, SHARE_OWNER_PASSWORD } from "./share.ts";
export { requireShowcaseBundle, requireShowcaseManifest } from "./showcase-bundle.ts";
export { bootShowcase } from "./showcase-guest.ts";
export { createTestLogger } from "./test-logger.ts";
