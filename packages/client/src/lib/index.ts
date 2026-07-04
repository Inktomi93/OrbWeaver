// lib/ front door — the cross-cutting display/util seams (UI-Arch §2.1). One home each: time (the
// ONE Intl site), notify (the ONE toast seam), message-render (the ONE display pipeline),
// download-json (the ONE export-click helper), view-transition (the ONE hand-rolled VT wrapper),
// test-ids (the typed registry). `cn` re-exports from the ui seal so features import ONE lib module.

export type { TimeLib, TimeLibConfig } from "@orb/kit/time";
export { createTimeLib } from "@orb/kit/time";
export { cn } from "@orb/ui/lib";
export { downloadJson, downloadUrl, slugifyFilename } from "./download-json";
export type { MessageRenderContext } from "./message-render";
export { renderMessageForDisplay } from "./message-render";
export type { Notify } from "./notify";
export { bindNotify, notify } from "./notify";
export type { TestIdKey } from "./test-ids";
export { TEST_IDS, testId } from "./test-ids";
export { timeLib } from "./time";
export { withViewTransition } from "./view-transition";
