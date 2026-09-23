// The app's failure-surface declare (#1081, `packages/client/src/lib/app-failure-surface.tsx`) — one
// read, shared by the drive readiness tripwire and the design-audit walk, so the DOM query has one home.
export const READ_FAILURE_SURFACE_JS = "(document.querySelector('[data-app-failure]') || { getAttribute: () => null }).getAttribute('data-app-failure')";
