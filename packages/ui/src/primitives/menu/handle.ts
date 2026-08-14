import { Menu as BaseMenu } from "@base-ui/react/menu";

// A detached menu handle — one <Menu> opened from N sources, the same shape the popover/tooltip/
// dialog/alert-dialog/drawer seals already expose. Like Popover (and unlike Dialog) it has NO
// openWithPayload: attach `payload`+`id` to a (possibly detached) trigger and call
// handle.open(triggerId).
export const createMenuHandle = BaseMenu.createHandle;
