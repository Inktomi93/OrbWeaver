// The Plugins config group (client-architecture-lockdown.md §8) — a
// `sections` SKIMMER on the extensions shelf: its rows are the Installed and Add-a-plugin contributions
// (`plugins-installed-section.tsx` / `plugins-install-section.tsx`) plus the admin-gated distribute section,
// all assembled at the door in that order.
//
// WHY AN APP-SHELF GROUP AND NOT A SECTION INSIDE `automation` (the alternative, recorded so it is not
// re-litigated): the plugin program's own design set names no client home, and §7's one-shell law offers
// CONTENT / CONTEXT→sheet / a modal / the settings surface. A grant screen is the SECURITY surface of this
// feature, and when this group was placed the `automation` group was `{placeholder: true}` — anchoring a
// consent screen inside a stub would have hidden the one screen a person must be able to find. (TRUTH-REPAIR
// 2026-08-24: automation is a REAL surface since cb8026bfc. The placement stands on its own second reason,
// which never depended on that: a group beside Connections, the other "credentials and reach" screen, is
// where a reader already looks for this class of thing.)
//
// UNGATED — every user has this group, and that is the ruling, not an oversight (D147). Plugins are
// USER-SCOPED: anyone installs for themselves and the plugin runs under them, so `plugin.list` returns the
// CALLER's own rows and every control acts on a row they own. There is deliberately no `when` here. Do NOT
// re-add `when: (viewer) => viewer.isAdmin` — the group used to carry it because every management verb was
// admin-gated on the server, and both halves moved together when that gate came off. The SERVER-WIDE install
// (admin-only) LANDED 2026-08-24 in exactly the shape this line predicted: a viewer-gated SECTION contributed
// at this anchor (`lib/plugin-distribute-section.tsx`), never a gate on the group — hiding a person's own
// installed plugins from them is the failure this line exists to prevent.

import { Blocks } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";

export const pluginsGroup: ConfigGroupDefinition = {
  id: "plugins",
  shelf: "extensions",
  label: "Plugins",
  icon: Blocks,
  description: "Sandboxed scripts that can extend chats — each one runs only with the permissions you grant it.",
  body: { kind: "sections" },
};
