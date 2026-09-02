// CT harness for the config row's TRAILING ACTION CELL (#928) — not a spec (Playwright CT needs mounted
// components in their own module, and biome forbids exporting a component from a `.ct.tsx`).
//
// WHY THE DEV ARM NEEDS ITS OWN MOUNT — and it is the OPPOSITE of what #928's contract assumed.
// `SettingRowActions` dispatches on the LITERAL `import.meta.env.DEV`, a BUILD-TIME constant the bundler
// folds. **Playwright CT builds the component graph with `vite build`, i.e. in PRODUCTION mode**, so
// `import.meta.env.DEV` is FALSE in every CT and the dispatcher there is permanently the END-USER arm.
// MEASURED 2026-09-02 on the CT bundle itself (`playwright/.cache/assets/_ct-stories-*.js`):
// "Copy setting id" 0 · "Already at its default" 0 · "its default" 1 — the dev menu is dead-code-eliminated
// and the production Reset survives. That makes the CT build a genuine production-bundle receipt AND means
// the DEV menu is the arm a CT can only reach by mounting it directly, which is what
// `SettingRowDevMenuStory` below is for. (The issue's cold correction predicted the reverse — "dev CT
// cannot prove bundle exclusion" — on the premise that CT runs in dev mode. It does not.)
//
// The binding is BUILT HERE rather than passed over the CT prop wire: `reset` is a function, and only
// plain data crosses. `resetFired` mirrors the call into a marker so a spec asserts the HANDLER ran rather
// than a repaint.

import { SettingRowDevActions, SettingRowResetAction } from "@orb/client/components";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";

/** A real leaf address — the copy verbs' output is derived from it, so it is the production spelling. */
const ADDRESS = { group: "appearance", sub: "message-style", setting: "color-quoted-speech" } as const;

export interface SettingRowResetStoryProps {
  /** `"modified"` = a bound, modified row (the one arm that shows a control) · `"unmodified"` = bound and
   *  at its default · `"unbound"` = a leaf that declares no `key`. */
  readonly arm?: "modified" | "unbound" | "unmodified";
  /** @defaultValue false — the in-flight reset, which must disable the control rather than hide it. */
  readonly pending?: boolean;
}

/** The end-user action cell inside a `group/setting` row root (what `SETTING_ROW_REVEAL` keys on). */
export function SettingRowResetStory({ arm = "modified", pending = false }: SettingRowResetStoryProps): ReactElement {
  const [fired, setFired] = useState(0);
  const binding =
    arm === "unbound"
      ? null
      : {
          current: arm === "modified" ? "flat" : "bubble",
          defaultValue: "bubble",
          modified: arm === "modified",
          reset: (): void => setFired((n) => n + 1),
          resetPending: pending,
        };
  return (
    <div className="group/setting">
      <SettingRowResetAction binding={binding} label="Chat display" />
      <output data-testid="reset-fired">{String(fired)}</output>
    </div>
  );
}

/** The DEVELOPER cell — the arm a production CT build cannot reach through the dispatcher. Same props the
 *  row hands it, so the menu's item set, its separator and both copy spellings are the production ones. */
export function SettingRowDevMenuStory({ arm = "modified" }: SettingRowResetStoryProps): ReactElement {
  const [fired, setFired] = useState(0);
  const binding =
    arm === "unbound"
      ? null
      : {
          current: arm === "modified" ? "flat" : "bubble",
          defaultValue: "bubble",
          modified: arm === "modified",
          reset: (): void => setFired((n) => n + 1),
          resetPending: false,
        };
  return (
    <TooltipProvider>
      <div className="group/setting">
        <SettingRowDevActions address={ADDRESS} binding={binding} label="Color quoted speech" />
        <output data-testid="reset-fired">{String(fired)}</output>
      </div>
    </TooltipProvider>
  );
}
