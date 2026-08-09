export type { SpinnerProps } from "./spinner.tsx";
// Loader2 `Spinner` is LEGACY-SCHEDULED (owner ruling 2026-08-09, one-loader system): its 6 call
// sites swap onto `WebSpinner` (identical `size`/`label` shape, same sm/md/lg px) in the follow-up
// lane, then this export + the Loader2 barrel row are deleted. Do not add new `Spinner` consumers.
export { Spinner } from "./spinner.tsx";
export type { WebSpinnerProps } from "./web-spinner.tsx";
export { WebSpinner } from "./web-spinner.tsx";
