import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";

/**
 * A detached tooltip handle — connects a `<Tooltip handle={…}>` to detached
 * `<TooltipTrigger handle={…}>` components and opens/closes it imperatively (Base UI 1.x `createHandle`).
 *
 * API DELTA vs Dialog: the tooltip handle has NO `openWithPayload`. It exposes `open(triggerId)`,
 * `close()`, and `isOpen` only — payload does NOT travel through the handle. To open with data, attach
 * `payload` + `id` to a (possibly detached) `<TooltipTrigger>` and call `handle.open(triggerId)`; the
 * payload then reaches `<Tooltip>`'s render-function children: `<Tooltip handle={h}>{({ payload }) => …}</Tooltip>`.
 *
 * Non-component export — sibling file keeps the seal `.tsx` component-only
 * (biome `useComponentExportOnlyModules`). Spec: ui-package-design §13 R2.
 */
export const createTooltipHandle = BaseTooltip.createHandle;

/** The handle object returned by {@link createTooltipHandle}. Typed to your trigger payload. */
export type TooltipHandle<Payload = unknown> = BaseTooltip.Handle<Payload>;
