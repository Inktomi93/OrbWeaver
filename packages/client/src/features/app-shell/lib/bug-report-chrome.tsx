// bugReportChrome — the dev bug-found button as a registered `topbar.trail` widget
// (the `fullscreenChrome` idiom). app-shell registers its OWN chrome through
// the same door as any other feature — no self-privilege, and no edit to `shell-topbar.tsx`.
//
// PLACEMENT: THE TOP RAIL, owner-ruled 2026-09-02 ("that feels cleanest"), dev-gated exactly like the rest of
// the dev tooling. `useVisible: () => IS_DEV` is that gate: the entry is registered unconditionally and renders
// NOTHING outside a dev build, which is the registry's own no-gap contract (`ChromeEntry.useVisible`).
//
// WHY THE GATE IS THE TYPED `IS_DEV` and not a bare `import.meta.env.DEV`: only main.tsx may spell the literal
// (a node-aggregator-reachable module fails `types:graph` on it — lib/dev-flag.ts's header states the rule).
// The consequence for tests is real and intended: a playwright CT builds in PRODUCTION mode, so this entry
// renders nothing in a CT and `BugReportButton`'s own CT mounts the component directly.
//
// `mobile` is deliberately unset ⇒ `topbar.trail`'s default, "stay on the row". The dev row is the developer's
// row; a phone-shaped curation for a dev-only affordance would be inventing a requirement.

import { IS_DEV } from "#lib";
import type { ChromeEntry } from "#state";
import { BugReportButton } from "../components/bug-report-button.tsx";

export const bugReportChrome: ChromeEntry = {
  id: "bug-report",
  label: "Report a bug",
  zone: "topbar.trail",
  // After the shell's own toggles (fullscreen is 20) — the capture affordance is the last thing on the row,
  // nearest the developer's attention and furthest from the controls a normal session uses.
  order: 90,
  useVisible: (): boolean => IS_DEV,
  behavior: { kind: "widget", body: (_presentation): ReturnType<typeof BugReportButton> => <BugReportButton /> },
};
