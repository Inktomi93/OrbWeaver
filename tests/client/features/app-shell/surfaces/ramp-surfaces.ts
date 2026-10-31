// The shell surfaces the ramp elevation fills, shared by the ramp host suite and its badge story.
const RAMP_LIST = '.shell-panel[data-panel-side="list"]';
export const RAMP_CONTEXT = '.shell-panel[data-panel-side="context"]';
export const RAMP_SURFACES = [RAMP_LIST, RAMP_CONTEXT, ".shell-main", ".shell-topbar"] as const;
