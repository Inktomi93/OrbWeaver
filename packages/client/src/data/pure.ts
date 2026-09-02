// data/ PURE-LOGIC front door (#1243, Arm A-prime — the fork ledger for #1228's residual). Same shape
// as state/pure.ts (that file's header carries the full ARM/enforcer rationale). This surface is
// data/index.ts's content MINUS every `.tsx` component export and MINUS the five files whose own code
// (or import chain) is DOM-coupled — a mechanical filter over data/index.ts, not a hand-picked symbol
// list, so it stays complete as index.ts grows.
//
// EXCLUDED, DOM-coupled directly: auth-bootstrap.ts (`globalThis.location.assign`), stale-session.ts
// (`globalThis.location`), query-boundary.tsx (a component).
// EXCLUDED, DOM-coupled via import chain: auth-config.ts (imports `#state`'s deployment-boot-hint.ts →
// appearance-boot-hint.ts, which touches `document`/`window` directly), use-session-recovery.ts.
// EXCLUDED, `.tsx` component files: query-error-state.tsx, query-inline-states.tsx, skeleton-rows.tsx.
// EXCLUDED, DOM-coupled via the internal `#lib` package alias (same class as state/pure.ts's #lib
// exclusions — see that file's header): bus/index.ts (createRoomRegistry + the 4 bus hooks),
// create-entity-mutation.ts, invalidation.ts, query-client.ts, session-freshness.ts, trpc.ts,
// use-prompt-macro-suggestions.ts. Their TESTS moved to tsconfig.tests-dom.json.
// EXCLUDED, DOM-coupled via the internal `#state` package alias (same mechanism, other direction):
// use-husk-reaper.ts, use-open-refinery.ts, use-settings-viewer-view.ts, use-start-chat.ts (each
// internally imports `#state`, which resolves to the impure state/index.ts, never state/pure.ts).
// FREE trim - no currently-active test consumed any of these four.

export { fetchPluginUiSource } from "./fetch-plugin-ui-source.ts";
export { throwHttpError } from "./http-error.ts";
export type { BundleImportStarted } from "./import-bundle.ts";
export { importBundle } from "./import-bundle.ts";
export type { CardImportResult } from "./import-characters.ts";
export { importCharacters } from "./import-characters.ts";
export type { ChatImportResult } from "./import-chats.ts";
export { importChats } from "./import-chats.ts";
export type { TreeImportStarted } from "./import-tree.ts";
export { importTree, relativePathOf } from "./import-tree.ts";
export { peekQueryData } from "./peek-query.ts";
export type { SessionResumeSnapshot } from "./session-resume.ts";
export { takeSessionResume, writeSessionResume } from "./session-resume.ts";
export { skeletonRowCountFor } from "./skeleton-row-metrics.ts";
export { uploadAsset } from "./upload-asset.ts";
export type { UploadDocumentResult } from "./upload-document.ts";
export { uploadDocument } from "./upload-document.ts";
export type { CardFrameRequest } from "./use-card-frame.ts";
export { cardFrameMintBody, mintCardFrame, useCardFrameSrc } from "./use-card-frame.ts";
export { useGatedQuery } from "./use-gated-query.ts";
export { useOnlineStatus } from "./use-online-status.ts";
export type { PluginFrameRequest } from "./use-plugin-frame.ts";
export { mintPluginFrame, pluginFrameMintBody, usePluginFrameSrc } from "./use-plugin-frame.ts";
