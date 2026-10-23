// The composed door: helpers that load the server graph. Integration files import it behind the setupFiles warm.

export type { AtlasBootOptions, CannedResponse } from "./atlas-guest.ts";
export { bootAtlas, bootAtlasDates, lastAtlasState } from "./atlas-guest.ts";
export { prepareBackupFolder } from "./backup-folder.ts";
export type { ChatRoot, ChatRootOptions } from "./chat/composed.ts";
export { createChatRoot } from "./chat/composed.ts";
export {
  assertPrivateCorpusNetwork,
  assertPrivateCorpusOutput,
  assertPrivateCorpusOutputArguments,
  cloneCorpusFixture,
  createCorpusCapsule,
  createCorpusHarness,
  loadCorpusFixture,
  privateCorpusParent,
  publishCorpusFixture,
  rethrowPrivateCorpusFailure,
  writePrivateCorpusFixture,
} from "./corpus.ts";
export { captureCookieAuth, seedCorpusAccount } from "./corpus-auth.ts";
export {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
export { createCorpusRecipe, prepareCorpusSnapFixture, runCorpusSnapConsumer } from "./corpus-recipe.ts";
export { seedCorpusActors, seedCorpusConnections, seedRecallCorpus, seedRecallRoom } from "./corpus-seed.ts";

export type { HeldDb, HeldStatement } from "./db.ts";
export { freshCountedDb, freshDb, freshHeldDb, migrationsBefore, SHIPPED_MIGRATIONS } from "./db.ts";
export type { DbFault } from "./db-faults.ts";
export { refuseWrites, withheldTable } from "./db-faults.ts";
export { makeAssetBytes, seedAsset } from "./factories/asset.ts";
export { seedAutomationRule, seedAutomationTestFires } from "./factories/automation.ts";
export { seedCharacter } from "./factories/character.ts";
export type { TranscriptLine } from "./factories/chat.ts";
export { seedChat, seedChatInvite, seedInvitedChatParticipant, seedTranscript } from "./factories/chat.ts";
export { captureSdkSessionRows } from "./factories/connection.ts";
export { makeResolvedSecret } from "./factories/credentials.ts";
export type { OwnerRowDamage } from "./factories/damaged-owner.ts";
export { damageOwnerRow } from "./factories/damaged-owner.ts";
export { seedCharacterDistillations } from "./factories/discovery.ts";
export { plantForeignCardBackground, plantForeignRoomBackground, plantForeignSettingsBytes, plantForeignSettingsValue } from "./factories/foreign-build.ts";
export { plantLegacyZeroCanon } from "./factories/legacy-canon.ts";
export { captureTurnRows, seedMessage } from "./factories/message.ts";
export type { PeerLease } from "./factories/peer-replica.ts";
export { seedPeerLease } from "./factories/peer-replica.ts";
export { seedPersona } from "./factories/persona.ts";
export {
  capturePluginRows,
  makePluginBundle,
  PLUGIN_ZIP_MTIME_SECONDS_RANGE,
  seedDistributedPlugin,
  seedInstalledPlugin,
  seedPluginGrant,
} from "./factories/plugin.ts";
export { seedPreset } from "./factories/preset.ts";
export { seedAdminProvider } from "./factories/provider.ts";
export { seedGlobalRegexScript, seedRegexScript } from "./factories/regex.ts";
export { captureRpgSnapshot, seedRpgCheckpoint, seedRpgGame } from "./factories/rpg.ts";
export { seedUserSettings } from "./factories/settings.ts";
export { seedCreatedTag } from "./factories/tag.ts";
export { seedWorkloadSchedule } from "./factories/workload.ts";
export type { ServerHarnessOptions, ServerTestHarness, UnclaimedServerTestHarness } from "./server.ts";
export { createServerHarness } from "./server.ts";
export { claimShareOwner, readRelayStarts, relayExecutable, relayProgram, SHARE_OWNER_PASSWORD } from "./share.ts";
export { requireShowcaseBundle, requireShowcaseManifest } from "./showcase-bundle.ts";
export { bootShowcase } from "./showcase-guest.ts";
