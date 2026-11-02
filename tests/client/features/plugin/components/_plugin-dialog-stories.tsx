import { openPluginDialog, setActiveSection } from "@orb/client/state";
import { CtClientProviders, ShellAmbientStory } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The `pluginDialog` modal opened on one dialog surface over the home section. */
export function PluginDialogShellStory({ subject }: { readonly subject: Parameters<typeof openPluginDialog>[0] }): ReactElement {
  useState(() => {
    setActiveSection("home");
    openPluginDialog(subject);
    return true;
  });
  return (
    <CtClientProviders>
      <ShellAmbientStory />
    </CtClientProviders>
  );
}
