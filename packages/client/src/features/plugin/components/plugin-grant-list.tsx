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
// THERE IS DELIBERATELY NO EQUIVALENT FOR HOSTS, and that is a correctness decision, not an omission — even
// now that `PluginView` projects `declaredCapabilities` and `netHosts` (#650 P1-2). The server judges a
// widening against the PRIOR manifest's `netHosts` (`domain/plugin/verbs/upgrade.ts`), and nothing persists
// THAT — the row's `manifest` column is overwritten on every upgrade, so by the time a re-consent notice
// renders, the "before" host list is already gone. A client can know the CURRENT host list, never the delta.
// An earlier revision of this component marked EVERY host "New" on a re-consent, which put a false claim on
// the security surface (the CT receipt showed `api.weather.example` — carried forward unchanged from v1 —
// wearing a New badge). The host list is therefore rendered plainly, as "what this version can reach", which
// is true and is what consent to an exact-host allowlist actually needs. A host-delta mark would need a
// SECOND persisted column (the prior list) to ever be added correctly.
//
// A11Y: each row is a real `Field` label wrapping its `Checkbox`, so the control has an accessible name and
// the whole row is the hit target (the side-eye 2026-08-09 P1-9 ruling — twelve bare checkboxes beside
// sibling `<Text>` had no name and an 18px target). "New" is a WORD in the accessible name, never a colour.
//
// A READ-ONLY row that is NOT granted renders a "Not granted" word-mark instead of a disabled checkbox
// (side-eye #650 P1-3). A `disabled` Checkbox still computes `cursor:pointer` (the shared selection-control
// skin's base class — `SELECTION_CONTROL`, `packages/ui/src/lib/selection-control.ts` — never overrides it
// for the disabled state) and `pointer-events:none` gives zero feedback on click, so an unchecked disabled
// box in the re-consent notice read as a live control that silently did nothing: the obvious next action on
// "asks for a permission you hadn't allowed" was to tick the empty box beside it. A checked read-only row
// keeps the checkbox — showing what you already have is a true state, not a false affordance — only an
// UNCHECKED read-only row swaps to a statement, because that is specifically the shape that looks tickable
// and isn't.

import type { PluginCapability } from "@orb/contracts/plugin";
import { NET_HOSTS_MAX } from "@orb/contracts/plugin";
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
  /** The accessible name for the capability list's `role="group"` — announces the permission set's own
   *  boundary (side-eye #650 P3: "What it's asking for" was a bare paragraph with no relation to the rows
   *  under it). Every call site already has this phrase sitting right above the list; pass it through
   *  rather than inventing a second copy of it here. */
  readonly capabilitiesLabel: string;
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
  const interactive = onToggle !== undefined;
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
          {/* "New" reads INFO (informational — this row changed) against "Costs money"'s WARNING (a real
              caution) — two amber "warning/soft" pills at a glance were indistinguishable (side-eye P2-8). */}
          {isNew ? (
            <Badge intent="info" size="sm" tone="soft">
              New
            </Badge>
          ) : null}
          {copy.spends === true ? (
            <Badge intent="warning" size="sm" tone="soft">
              Costs money
            </Badge>
          ) : null}
          {/* The elevated-risk mark (side-eye P2-9): a capability that mutates YOUR outgoing content, room
              state or global state, registers code the app will run for you, or leaves the sandbox entirely.
              `ghost` keeps it quieter than the two solid-tint marks above (a new/spend fact is more urgent
              than "this one reaches further than most"), while still breaking the otherwise-uniform weight
              every row shared regardless of what it actually does. */}
          {copy.risk === true ? (
            <Badge intent="danger" size="sm" tone="ghost">
              Reaches further
            </Badge>
          ) : null}
        </Row>
      }
      orientation="horizontal"
    >
      {/* A CHECKED read-only row keeps the checkbox: "you already have this" is a true state, not a false
          affordance. An UNCHECKED read-only row is the one shape that looked tickable and did nothing on
          click (P1-3, see the file header) — it becomes a plain word-mark instead of an inert control. */}
      {interactive || checked ? (
        <Checkbox checked={checked} disabled={!interactive} onCheckedChange={(next): void => onToggle?.(capability, next)} />
      ) : (
        <Text className="text-muted-foreground" voice="label">
          Not granted
        </Text>
      )}
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
  capabilitiesLabel,
  onToggle,
}: PluginGrantListProps): ReactElement {
  const grantedSet = new Set<PluginCapability>(granted);
  const addedSet = new Set<PluginCapability>(addedCapabilities ?? []);
  const rows = orderedDeclared(declared);
  const unexplained = unexplainedCount(declared);
  // The host list rides `netHosts` alone (DECLARED, not granted) — this component shows what a screen is
  // ASKING about or has ASKED about, checked or not, same as every other capability row. A caller whose
  // screen instead means "what is CONFIRMED" (the durable disclosure — past tense, not a live confirm) is
  // responsible for gating its OWN `netHosts` prop on whether `net.fetch` is actually granted before
  // passing it in; doing that gate HERE would hide the host list from the re-consent notice's own newly-
  // asked, not-yet-granted `net.fetch` case, which is exactly the reach a person needs to see to decide.
  const showHosts = netHosts.length > 0;

  return (
    <Stack gap="block">
      {rows.length === 0 ? (
        <Text prose={true} voice="gloss">
          This plugin asks for no permissions at all — it can run its own code and nothing else.
        </Text>
      ) : (
        // `role="group"` + `aria-label` gives the permission set an announced boundary (side-eye P3): the
        // caller's own heading text ("What it's asking for" / "What Weather Teller is allowed to do") is
        // threaded through rather than re-spelled, so the two can never drift apart.
        <Stack aria-label={capabilitiesLabel} gap="block" role="group">
          {rows.map((capability) => (
            <GrantRow key={capability} capability={capability} checked={grantedSet.has(capability)} isNew={addedSet.has(capability)} onToggle={onToggle} />
          ))}
        </Stack>
      )}

      {unexplained > 0 ? (
        <Text prose={true} role="alert" voice="gloss">
          {unexplained === 1 ? "This plugin asks for 1 permission" : `This plugin asks for ${unexplained} permissions`} this version of Orbweaver doesn't
          recognise. Update Orbweaver before installing it.
        </Text>
      ) : null}

      {showHosts ? (
        <Stack gap="field">
          <Stack gap="tight">
            <Text voice="label">
              {netHostsHeading} ({netHosts.length}/{NET_HOSTS_MAX})
            </Text>
            {/* The sentence that declares the list EXHAUSTIVE was the smallest, quietest text on the whole
                screen (10.5px, side-eye P2-5) — the endpoints below it shouted at 15px/regular-foreground
                while the guarantee whispered. `prose` lifts it to the 13px step (still `gloss`'s muted ink,
                still visually a caption, just no longer beneath its own claim's weight). */}
            <Text prose={true} voice="gloss">
              These exact hostnames, and nothing else.
            </Text>
          </Stack>
          {/* Real list semantics (side-eye P3 — eight loose paragraphs had no `role="list"`), and the hosts
              themselves render muted/mono (`datumMono`) rather than the un-voiced Text default (15px,
              full-foreground) they used to carry: a raw hostname is a machine readout to verify, not the
              thing on the screen that should read loudest — the CAPABILITY rows and the completeness
              guarantee above it are what a person actually decides on. No per-host "New" mark: which hosts
              changed is not derivable client-side (see the file header). The whole list, plainly, is the
              true statement — and for an exact-host allowlist it is also the useful one, since consent is
              to the SET. */}
          <ul className="m-0 flex list-none flex-col gap-tight p-0">
            {netHosts.map((host) => (
              <li key={host}>
                <Text voice="datumMono">{host}</Text>
              </li>
            ))}
          </ul>
        </Stack>
      ) : null}
    </Stack>
  );
}
