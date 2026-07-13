import { Popover as BasePopover } from "@base-ui/react/popover";

// A detached popover handle. Unlike Dialog, it has NO openWithPayload — attach `payload`+`id` to a
// (possibly detached) trigger and call handle.open(triggerId) instead.
export const createPopoverHandle = BasePopover.createHandle;

export type PopoverHandle<Payload = unknown> = BasePopover.Handle<Payload>;
