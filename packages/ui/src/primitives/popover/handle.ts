import { Popover as BasePopover } from "@base-ui/react/popover";

/**
 * A detached popover handle — connects a `<Popover handle={…}>` to detached
 * `<PopoverTrigger handle={…}>` components and opens/closes it imperatively (Base UI 1.x `createHandle`).
 *
 * API DELTA vs Dialog: the popover handle has NO `openWithPayload`. It exposes `open(triggerId)`,
 * `close()`, and `isOpen` only — payload does NOT travel through the handle. To open with data, attach
 * `payload` + `id` to a (possibly detached) `<PopoverTrigger>` and call `handle.open(triggerId)`; the
 * payload then reaches `<Popover>`'s render-function children: `<Popover handle={h}>{({ payload }) => …}</Popover>`.
 *
 * Non-component export — sibling file keeps the seal `.tsx` component-only
 * (biome `useComponentExportOnlyModules`). Spec: ui-package-design §13 R2.
 */
export const createPopoverHandle = BasePopover.createHandle;

/** The handle object returned by {@link createPopoverHandle}. Typed to your trigger payload. */
export type PopoverHandle<Payload = unknown> = BasePopover.Handle<Payload>;
