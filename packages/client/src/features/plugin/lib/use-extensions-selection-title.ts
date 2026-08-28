// What the MOBILE topbar calls the open extension page — the section's `useSelectionTitle` (the shell calls it
// unconditionally inside a component keyed on the active section, so it may read the section's own cache).
//
// It names the PAGE, never the section: on a phone the pushed frame's bar is the only thing telling a person
// where they are, and "Extensions" over someone's hub browser names the shelf instead of the book. `null` = no
// page open, or the read has not landed — the shell then prints the section label, never a blank bar.

import { usePluginPageKey } from "#state";
import { usePluginPages } from "../hooks/use-plugin-pages.ts";

export function useExtensionsSelectionTitle(): string | null {
  const key = usePluginPageKey();
  const pages = usePluginPages();
  if (key === null) {
    return null;
  }
  return pages.find((page) => page.key === key)?.title ?? null;
}
