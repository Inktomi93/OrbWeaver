// THE SETTINGS PANE'S "your settings couldn't be read" GATE (#1716/#1771) — the ONE place the whole
// settings surface learns that `user_settings.config` cannot be read, and the ONE place its repair door is.
//
// WHY IT WRAPS RATHER THAN SITS BESIDE. The condition is the BLOB's, not any one section's: when the
// stored blob is unreadable, every section on the pane is showing schema defaults and every section's save
// is refused server-side with `stored_config_unreadable` (the #471 guard). So this component does both
// halves at the one place every self-owned section body is rendered through — it states the condition once
// (N stacked banners is the smear the save-status seam exists to prevent) and mounts
// `SaveUnwritableContext`, which stands down every autosave driver beneath it: no debounce, no crash-draft
// mirror, no teardown flush, and a status line that reads "Can't save — this couldn't be read" instead of
// "Saved" over a form that cannot save.
//
// THE DOOR IS `settings.resetUserConfig` (#1771), and until that verb existed there was NONE. Every other
// settings write read-merges the stored blob and is therefore correctly refused: the section autosave, the
// per-leaf "Reset <label> to its default" (`use-config-leaf.ts` writes through `updateUserSettingsSection`),
// and the backup restore. The per-leaf Reset is not even OFFERED here — it renders only on a `modified` row,
// and `modified` compares the DEGRADED read against the defaults, so on an unreadable blob every row
// compares equal and the whole action column goes empty exactly when it is needed.
//
// TWO ARMS BY CAUSE, and the difference is destructive: a `version-from-future` blob is INTACT data this
// build is too old to represent, so resetting it destroys what a newer Orbweaver stored. The copy
// (`#lib`'s `SETTINGS_UNREADABLE_COPY`) says so, and the door's own words follow `resetIsPrimary` — the
// primary repair on a corrupt blob, an explicitly-labelled last resort on a newer-version one.
//
// A NON-SUSPENSE read: this wraps the pane's body, and a settings read that has not landed must render the
// pane exactly as before rather than holding the whole surface on a second boundary. No row / no failure
// reported ⇒ this component is transparent.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { ConfirmDialog, StoredConfigUnreadableNotice } from "#components";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { SaveUnwritableContext } from "#forms";
import { SETTINGS_UNREADABLE_COPY, unreadableConfigCause } from "#lib";

const useResetUserConfig = createEntityMutation<void, unknown>({
  options: (trpc) => trpc.settings.resetUserConfig.mutationOptions(),
  busDriven: true, // resetUserConfig emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't reset your settings.",
});

/** The pane gate: transparent while the stored blob reads fine, the state + its door when it does not. */
export function SettingsUnreadableGate({ children }: { readonly children: ReactNode }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const reset = useResetUserConfig({ trpc, invalidation });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const failure = settings?.configUnreadable ?? null;
  if (failure === null) {
    return <>{children}</>;
  }
  const copy = SETTINGS_UNREADABLE_COPY[unreadableConfigCause(failure)];
  const doorLabel = copy.resetIsPrimary ? "Reset my settings to the defaults" : "Reset my settings anyway";

  return (
    <SaveUnwritableContext value={true}>
      <StoredConfigUnreadableNotice
        copy={copy}
        doors={
          <Row>
            <Button intent={copy.resetIsPrimary ? "primary" : "ghost"} onClick={(): void => setConfirmOpen(true)} size="sm" type="button">
              {doorLabel}
            </Button>
          </Row>
        }
      />
      <ConfirmDialog
        confirmLabel="Reset settings"
        description="This replaces every setting with the defaults. What is stored now can't be read, and resetting discards it — this can't be undone."
        onConfirm={async (): Promise<void> => {
          await reset.mutateAsync();
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Reset all your settings?"
      />
      {children}
    </SaveUnwritableContext>
  );
}
