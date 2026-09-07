// The CONFIG-GROUP registries a client CT mounts the config host over — assembled as at the real door
// (`compose/authed-app.tsx`, config-revamp-design.md §3.1 / §6.8): total over CONFIG_GROUP_IDS, the nine
// settings skimmers + the four collections, handed to `makeConfigSection` / the host panes by FACTORY (there
// is no context pair for it). A non-component module beside `ct-data-providers.tsx` (which exports only
// components — playwright-ct's Fast Refresh rule): the providers import the registries from here, and a
// story that mounts the LIST/CONTENT panes directly takes them from here too.

import { automationGroup } from "@orb/client/features/automation";
import { connectionsGroup } from "@orb/client/features/credentials";
import { personasGroup } from "@orb/client/features/persona";
import { pluginsGroup } from "@orb/client/features/plugin";
import { regexGroup } from "@orb/client/features/regex";
import { rosterGroup } from "@orb/client/features/roster-preset";
import { appearanceGroup, chatBehaviorGroup } from "@orb/client/features/settings";
import { tagsGroup } from "@orb/client/features/tag";
import { adminGroup } from "@orb/client/features/user-admin";
import { backupGroup, workloadsGroup } from "@orb/client/features/workloads";
import { worldInfoGroup } from "@orb/client/features/world-info";
import { createRegistry } from "@orb/client/lib";
import type { ConfigGroupDefinition, ConfigGroupId, ConfigGroupRegistry } from "@orb/client/state";
import { CONFIG_GROUP_IDS } from "@orb/client/state";

const REAL_CONFIG_GROUPS: Record<ConfigGroupId, ConfigGroupDefinition> = {
  personas: personasGroup,
  appearance: appearanceGroup,
  "chat-behavior": chatBehaviorGroup,
  workloads: workloadsGroup,
  backup: backupGroup,
  connections: connectionsGroup,
  automation: automationGroup,
  admin: adminGroup,
  tags: tagsGroup,
  regex: regexGroup,
  worldInfo: worldInfoGroup,
  rosterPreset: rosterGroup,
  plugins: pluginsGroup,
};

/** The REAL 13-group registry — the door's. */
export const realConfigGroups: ConfigGroupRegistry = createRegistry<ConfigGroupId, ConfigGroupDefinition>(
  "config-groups",
  CONFIG_GROUP_IDS,
  REAL_CONFIG_GROUPS,
);

// #696 — a live subject for the config host's PLACEHOLDER branch. The `ConfigGroupPlaceholder` component
// (the honest "not built yet" body for a deferred group) lost its last production subject at C5 (cb8026bfc
// turned the final `{ placeholder: true }` group — automation — into a real surface), so the placeholder
// body renders for nobody today. The mechanism is deliberate scaffolded intent ("swapped for the real
// surface, group by group, as each lands"), so rather than delete future intent it earns a live subject
// here: a group registry identical to the real one but with ONE group (connections) swapped to a
// `{ placeholder: true }` body — a synthetic "if this group's sections hadn't landed yet" scenario,
// production groups untouched. Reuses connections' real identity, the honest placeholder shape.
const placeholderGroupDef: ConfigGroupDefinition = {
  id: connectionsGroup.id,
  shelf: connectionsGroup.shelf,
  label: connectionsGroup.label,
  icon: connectionsGroup.icon,
  description: connectionsGroup.description,
  body: { placeholder: true },
};

/** The #696 placeholder variant of {@link realConfigGroups} (connections → `{ placeholder: true }`). */
export const placeholderConfigGroups: ConfigGroupRegistry = createRegistry<ConfigGroupId, ConfigGroupDefinition>("config-groups", CONFIG_GROUP_IDS, {
  ...REAL_CONFIG_GROUPS,
  connections: placeholderGroupDef,
});
