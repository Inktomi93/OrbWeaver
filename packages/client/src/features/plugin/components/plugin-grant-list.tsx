// plugin-grant-list — THE SECURITY SURFACE of the plugin feature: the list of everything a bundle is
// asking for, and (in the editable arm) the subset the person actually confirms.
//
// THE CONTRACT THIS COMPONENT OWES, from #24: a person must be able to see exactly what they are agreeing
// to. Concretely, three things every arm renders:
//   1. every DECLARED capability, in `PLUGIN_CAPABILITIES` order, each with the plain-English consequence
//      of granting it (`plugin-copy.ts` — a capability with no sentence is a compile error, not a blank row);
//   2. the SPEND mark on the two capabilities that draw on the installer's budget — never buried in prose;
//   3. `netHosts` VERBATIM whenever `net.fetch` is declared. `net.fetch` is parameterized by its allowlist,
//      so the capability NAME is not the reach — the hosts are. This is exactly why the server's re-consent
//      rule treats a swapped host list as a widening (`domain/plugin/verbs/upgrade.ts`), and a consent screen
//      that showed only the capability name would be consenting to the wrong thing.
//
// `added` marks CAPABILITY rows that are new relative to what is already granted — the upgrade re-consent
// case. The caller computes it from the same two inputs the server compares, so the mark agrees with the
// server's own verdict.
//
// THERE IS DELIBERATELY NO EQUIVALENT FOR HOSTS, and that is a correctness decision, not an omission. The
// server compares a new manifest's `netHosts` against the PRIOR MANIFEST's (`domain/plugin/verbs/upgrade.ts`),
// and `PluginView` projects neither the declared capabilities nor `netHosts` — so a client CANNOT know which
// hosts are new. An earlier revision of this component marked EVERY host "New" on a re-consent, which put a
// false claim on the security surface (the CT receipt showed `api.weather.example` — carried forward
// unchanged from v1 — wearing a New badge). The host list is therefore rendered plainly, as "what this
// version can reach", which is true and is what consent to an exact-host allowlist actually needs. When the
// projection lands, a host-delta mark is an ADDITION here, not a rewrite.
//
// A11Y: each row is a real `Field` label wrapping its `Checkbox`, so the control has an accessible name and
// the whole row is the hit target (the side-eye 2026-08-09 P1-9 ruling — twelve bare checkboxes beside
// sibling `<Text>` had no name and an 18px target). "New" is a WORD in the accessible name, never a colour.

import type { PluginCapability } from "@orb/contracts/plugin";
import { Badge } from "@orb/ui/badge";
import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CAPABILITY_COPY_ROWS, capabilityCopy } from "../lib/plugin-copy.ts";

export interface PluginGrantListProps {
  /** What the manifest DECLARES — the full ask. */
  readonly declared: readonly PluginCapability[];
  /** The exact hosts `net.fetch` may reach, straight off the manifest. */
  readonly netHosts: readonly string[];
  /**
   * The confirmed subset. In the editable arm this is component state the caller owns; in the read-only arm
   * it is what the server already recorded, and the difference between it and `declared` is what a person
   * is being asked to confirm.
   */
  readonly granted: readonly PluginCapability[];
  /** CAPABILITIES that are new versus the previous grant — the re-consent highlight. Hosts have no
   *  equivalent and must not gain one until the projection exists (see the header). */
  readonly addedCapabilities?: readonly PluginCapability[];
  /** The heading over the host list. Defaults to the install-time phrasing; the re-consent case says
   *  "this version" instead, because it is showing a list that may have changed in ways it cannot name. */
  readonly netHostsHeading?: string;
  /** Omit to render read-only (the row's checkbox becomes a non-interactive state mark). */
  readonly onToggle?: (capability: PluginCapability, next: boolean) => void;
}

/** The declared capabilities in display order, skipping any this build has no sentence for. */
function orderedDeclared(declared: readonly PluginCapability[]): readonly PluginCapability[] {
  const asked = new Set<PluginCapability>(declared);
  return CAPABILITY_COPY_ROWS.filter((row) => asked.has(row.id)).map((row) => row.id);
}

/** How many declared capabilities this build cannot explain — a stale client against a newer server. The
 *  surface SAYS this rather than silently rendering a shorter list: an unexplained permission that vanishes
 *  from a consent screen is the one failure mode this component exists to prevent. */
function unexplainedCount(declared: readonly PluginCapability[]): number {
  return declared.filter((capability) => capabilityCopy(capability) === undefined).length;
}

interface GrantRowProps {
  readonly capability: PluginCapability;
  readonly checked: boolean;
  readonly isNew: boolean;
  readonly onToggle: PluginGrantListProps["onToggle"];
}

function GrantRow({ capability, checked, isNew, onToggle }: GrantRowProps): ReactElement | null {
  const copy = capabilityCopy(capability);
  if (copy === undefined) {
    return null;
  }
  // The NEW mark rides the accessible NAME, not just the badge — a re-consent screen read aloud has to
  // distinguish the rows that changed from the ones carried forward, and a colour cannot say that.
  const name = isNew ? `${copy.label} (new in this update)` : copy.label;
  return (
    // `label` + `description` + a bare control child is the shape `orientation="horizontal"` is BUILT for:
    // the name and its consequence take the row's slack on the left and the checkbox docks right in the
    // fixed control column. Putting the consequence in the CHILDREN instead crams it into that narrow
    // column and strands the checkbox ~370px from its own label (measured in the CT browser at the 560px
    // pane width before this was fixed) — the layout the primitive's `multiline` arm exists to prevent.
    <Field
      description={copy.consequence}
      label={
        <Row align="center" gap="field">
          <Text voice="label">{name}</Text>
          {isNew ? (
            <Badge intent="warning" size="sm" tone="soft">
              New
            </Badge>
          ) : null}
          {copy.spends === true ? (
            <Badge intent="warning" size="sm" tone="soft">
              Costs money
            </Badge>
          ) : null}
        </Row>
      }
      orientation="horizontal"
    >
      <Checkbox checked={checked} disabled={onToggle === undefined} onCheckedChange={(next): void => onToggle?.(capability, next)} />
    </Field>
  );
}

/** The reach list. Editable when `onToggle` is supplied (the install/upgrade confirm), read-only otherwise
 *  (an installed row's "what it can do" disclosure). */
export function PluginGrantList({
  declared,
  netHosts,
  granted,
  addedCapabilities,
  netHostsHeading = "Hosts it can reach",
  onToggle,
}: PluginGrantListProps): ReactElement {
  const grantedSet = new Set<PluginCapability>(granted);
  const addedSet = new Set<PluginCapability>(addedCapabilities ?? []);
  const rows = orderedDeclared(declared);
  const unexplained = unexplainedCount(declared);

  return (
    <Stack gap="block">
      {rows.length === 0 ? (
        <Text voice="gloss">This plugin asks for no permissions at all — it can run its own code and nothing else.</Text>
      ) : (
        <Stack gap="block">
          {rows.map((capability) => (
            <GrantRow key={capability} capability={capability} checked={grantedSet.has(capability)} isNew={addedSet.has(capability)} onToggle={onToggle} />
          ))}
        </Stack>
      )}

      {unexplained > 0 ? (
        <Text role="alert" voice="gloss">
          {unexplained === 1 ? "This plugin asks for 1 permission" : `This plugin asks for ${unexplained} permissions`} this version of Orbweaver doesn't
          recognise. Update Orbweaver before installing it.
        </Text>
      ) : null}

      {netHosts.length === 0 ? null : (
        <Stack gap="tight">
          <Text voice="label">{netHostsHeading}</Text>
          <Text voice="gloss">These exact hostnames, and nothing else.</Text>
          {/* No per-host "New" mark: which hosts changed is not derivable client-side (header). The whole
              list, plainly, is the true statement — and for an exact-host allowlist it is also the useful
              one, since consent is to the SET. */}
          <Stack gap="tight">
            {netHosts.map((host) => (
              <Text key={host}>{host}</Text>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
