// The node helpers door: Node-side helpers that never load the server graph at import, importable outside vitest.

export { assertEventSequence } from "./chat/assertions.ts";
export type { ChromiumIdentity } from "./chromium-processes.ts";
export {
  chromiumDescendantIdentities,
  identityKey,
  leakChromiumArgs,
  livingChromiumIdentities,
  terminateChromiumIdentities,
  watchChromiumDescendants,
} from "./chromium-processes.ts";
export { makeRuleView } from "./factories/automation-view.ts";
export { makeChatDetail, makeChatId, makeChatSummaryView, makeRedeemInviteResult } from "./factories/chat-view.ts";
export { makePluginRow, makePluginScriptedPage } from "./factories/plugin-view.ts";
export { makePresetDetail, makePresetSummary } from "./factories/preset-view.ts";
export { principal } from "./factories/principal.ts";
export { makeCachePolicy, makeResolved, makeResolvedView, TEST_BASE_URL, TEST_OWNER_ID, TEST_PROVIDER_ID } from "./factories/resolved-connection.ts";
export { makeTagView } from "./factories/tag-view.ts";
export type { FakeAcme } from "./fake-acme.ts";
export { startFakeAcme } from "./fake-acme.ts";
export { startFilmstripAuthFixture } from "./filmstrip-auth-fixture.ts";
export { freeLoopbackPort } from "./free-port.ts";
export { requestWithHost } from "./host-request.ts";
export { lanAddress } from "./lan-address.ts";
export { magicBytes } from "./magic-bytes.ts";
export { CLIENT_ID, createNativeIssuer, ISSUER, NATIVE_OIDC_SETTINGS } from "./oidc-issuer.ts";
export type { TerminalFrameOptions } from "./provider-stream.ts";
export { terminalSseLine } from "./provider-stream.ts";
export type { SdkPrivateDiagnosticInput, SdkPrivateDiagnosticResult, SdkScriptSpawn } from "./sdk-process.ts";
export {
  createSdkProcessSpawner,
  readSdkProcessInput,
  SDK_PRIVATE_DIAGNOSTIC_SINKS,
  SDK_SCRIPT_IDENTITY_TYPE,
  sdkPrivateDiagnosticResultSchema,
} from "./sdk-process.ts";
export { STORY_SHOT_DIR } from "./story-shot.ts";
export type { TlsAnswer } from "./tls-hop.ts";
export { tlsRequest } from "./tls-hop.ts";
export { GENERAL_NAME_IP_TAG, ipBytes, ipCertificatePem, readCsr } from "./x509.ts";
