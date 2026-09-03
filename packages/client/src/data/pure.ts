// data/ PURE-LOGIC front door (#1243). HAND-MAINTAINED mirror of a data/index.ts subset — NO enforcer
// keeps it complete. #1262 (2026-09-03) measured its stated reasons (DOM-crash risk, type-graph
// isolation, import cost) against the real tree and refuted all three — receipts on issue #1262.

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
