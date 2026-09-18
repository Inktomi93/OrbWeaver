// plugin-grant-list — THE SECURITY SURFACE of the plugin feature: the list of everything a bundle is
// asking for, and what of it is already granted.
//
// IT IS READ-ONLY, AND THAT IS AN OWNER RULING, NOT A MISSING FEATURE (#1855, landed `5e713309e`). This
// component used to carry an EDITABLE arm — an `onToggle` prop that made each row a live checkbox and let a
// person cherry-pick a subset — and both of its call sites (the install card's confirm block and the row's
// re-consent notice) drove it. The owner replaced that with APPROVE-ALL / DENY on both surfaces: "unchecking
// capabilities the plugin declares rarely leaves a working plugin, and it taught people to tick boxes
// without reading". The prop and its arm are DELETED here rather than left behind with no caller, because a
// dead editable arm on a security surface is an affordance a later revision can re-enable by accident —
// which is exactly the shape #650 P1-3 was filed about, one level up.
// A ROW THEREFORE HAS TWO STATES, not three: GRANTED (a checked, non-interactive checkbox — "you already
// have this" is a true state) and NOT GRANTED (a `w-checkbox` spacer plus a word-mark, see the last
// paragraph of this header). Nothing here is clickable.
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
// `addedCapabilities` marks CAPABILITY rows that are new relative to what is already granted — the upgrade
// re-consent case. The caller computes it from the same two inputs the server compares, so the mark agrees
// with the server's own verdict.
//
// `addedNetHosts` IS THE HOST EQUIVALENT, AND IT ARRIVED LATE FOR A REASON WORTH KEEPING. There was no such
// mark until #659, and its absence was a correctness decision rather than an omission: the server judges a
// host widening against the PRIOR manifest's `netHosts` (`domain/plugin/verbs/upgrade.ts`), and the row's
// `manifest` column is overwritten by that same upgrade — so the "before" list was already gone by the time
// a notice could render, and a client could know the CURRENT hosts but never the delta. An earlier revision
// marked EVERY host "New" on a re-consent, which put a false claim on the security surface (the CT receipt
// showed `api.weather.example` — carried forward unchanged from v1 — wearing a New badge). The ruling that
// followed ("state the whole set, badge nothing") survives; its INPUT changed. `plugins.widened_net_hosts`
// now records the delta at the one moment it exists, `PluginView.widenedNetHosts` projects it, and the
// caller passes it here VERBATIM. So the rule this component still enforces is the same one: a host is
// marked because the SERVER said it was added, never because a client inferred it. Do not compute this
// prop from anything else — the host fold (case, trailing dot) lives server-side and has exactly one home.
//
// A11Y + GEOMETRY: each row is CHECKBOX-LEADING — the control sits ADJACENT to the words it reports on. The
// prior shape — `Field orientation="horizontal"` — docked the checkbox in the fixed control column at the
// row's FAR edge (`justify-between`), which at the 560-746px pane put a security checkbox ~400px of dead gap
// away from its own label (side-eye 2026-08-29 P2-2; the same primitive's geometry stranded a checkbox ~370px
// once before, `field-forces-a11y-suppression` layout sibling). A control-leading Field variant was REJECTED
// as the fix: it would grow a sealed primitive's axis for one consumer.
// THE `<label htmlFor>` HIT TARGET LEFT WITH THE EDITABLE ARM (#1855). While the rows were live, the name,
// the pills AND the consequence sat inside a bare `<label htmlFor>` so the whole text block toggled the box
// — P2-2's other half, "a security decision should not demand an 18px aim". With nothing to toggle there is
// no target to widen, and a `<label>` over a non-interactive checkbox would advertise one. The ADJACENCY
// half of that finding is what still holds and is still pinned; the hit-area half is retired with its arm.
//
// THE ACCESSIBLE NAME IS AN EXPLICIT `aria-labelledby` NAMING EXACTLY TWO NODES — the capability's own
// label Text, plus the "New" pill on a re-consent row. Never the wrapping label's textContent, and never
// `aria-label` (side-eye 2026-08-29 P3-5, and the correction below).
//
// THE FIRST FIX WAS WRONG AND MEASURED SO. It set `aria-label` on the checkbox and claimed "`aria-label`
// wins the accname algorithm over the native label". It does not when `aria-labelledby` is ALSO present,
// and Base UI's `Checkbox.Root` emits one automatically from the `<label htmlFor>` this row wraps its text
// in — so the aria-label was inert and the computed name was the WHOLE label subtree. Measured on
// a2cb2ada7 with `Locator.ariaSnapshot()` (an accname computation; reading the `aria-label` ATTRIBUTE back
// looks correct and proves nothing):
//     checkbox "Write lorebook entries New Reaches further Adds and updates entries in lorebooks already
//               attached to the room, up to 64 entries."
// That is the original run-on plus the consequence — worse than what P3-5 filed, with the consequence read
// twice (name + `aria-describedby`) and "(new in this update)" audible NOWHERE, having also been deleted
// from the visible text.
//
// An explicit `aria-labelledby` outranks the generated one, so the name is exactly `<label>` or
// `<label> New`. That keeps every claim the original ruling made, and one it could not: the NEW mark rides
// the NAME (a re-consent screen read aloud has to distinguish the rows that changed, and a colour cannot
// say that) — now in the pill's OWN visible words, so 2.5.3 containment is stronger than the invented
// "(new in this update)" phrasing ever was. The other pills stay out of the name and remain plain readable
// text in the a11y tree; the consequence reaches AT via `aria-describedby`, once. The visible "(new in this
// update)" suffix stays GONE from the label text — the "New" badge beside it said the identical thing 8px
// away (P3-5's redundancy half).
//
// TRUTH-REPAIR (#1855): the paragraph above argues against a generated `aria-labelledby` that Base UI derived
// from the WRAPPING `<label htmlFor>`. That wrapper is gone with the editable arm, so there is no generated
// name left to outrank — the explicit `aria-labelledby` is now simply the only name, and it still names
// exactly the label node plus the "New" pill. The ruling holds unchanged; what it was competing with does
// not exist any more, and the explicit spelling is kept rather than dropped because it is what PINS the
// pills out of the name (a bare `aria-label`-less checkbox would fall back to the same subtree run-on the
// moment anything re-wraps this row). One claim it can no longer make: an UNGRANTED row has no checkbox at
// all now, so its "New" mark rides no accessible NAME — it is the plain adjacent text beside "Not granted",
// which is the shape #1855 chose when it made those rows statements rather than questions.
//
// A ROW THAT IS NOT GRANTED renders a "Not granted" word-mark instead of a disabled checkbox
// (side-eye #650 P1-3). A `disabled` Checkbox still computes `cursor:pointer` (the shared selection-control
// skin's base class — `SELECTION_CONTROL`, `packages/ui/src/lib/selection-control.ts` — never overrides it
// for the disabled state) and `pointer-events:none` gives zero feedback on click, so an unchecked disabled
// box in the re-consent notice read as a live control that silently did nothing: the obvious next action on
// "asks for a permission you hadn't allowed" was to tick the empty box beside it. A checked read-only row
// keeps the checkbox — showing what you already have is a true state, not a false affordance — only an
// UNCHECKED read-only row swaps to a statement, because that is specifically the shape that looks tickable
// and isn't. With the leading-control layout the word-mark moves ONTO the label row (beside the name it
// refuses, where the eye already is) and the lead column keeps a `w-checkbox` spacer, so mixed
// granted/ungranted rows still share one left rail.

import type { PluginCapability } from "@orb/contracts/plugin";
import { NET_HOSTS_MAX } from "@orb/contracts/plugin";
import { Badge } from "@orb/ui/badge";
import { Checkbox } from "@orb/ui/checkbox";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { CAPABILITY_COPY_ROWS, capabilityCopy } from "../lib/plugin-copy.ts";

export interface PluginGrantListProps {
  /** What the manifest DECLARES — the full ask. */
  readonly declared: readonly PluginCapability[];
  /** The exact hosts `net.fetch` may reach, straight off the manifest. */
  readonly netHosts: readonly string[];
  /**
   * What the server already recorded as granted. The difference between it and `declared` is what a person
   * is being asked to approve (#1855: as a whole, or not at all).
   */
  readonly granted: readonly PluginCapability[];
  /** CAPABILITIES that are new versus the previous grant — the re-consent highlight. */
  readonly addedCapabilities?: readonly PluginCapability[];
  /** HOSTS this update added, straight off `PluginView.widenedNetHosts` — the server's own verdict, recorded
   *  at the upgrade against a manifest that no longer exists (see the header). Pass it through; never derive
   *  it. Entries are matched against {@link netHosts} by exact string, which is correct because the server
   *  filtered them out of that very array. */
  readonly addedNetHosts?: readonly string[];
  /** The heading over the host list. Defaults to the install-time phrasing; the re-consent case says
   *  "this version" instead, because it is showing a list that may have changed in ways it cannot name. */
  readonly netHostsHeading?: string;
  /** The accessible name for the capability list's `role="group"` — announces the permission set's own
   *  boundary (side-eye #650 P3: "What it's asking for" was a bare paragraph with no relation to the rows
   *  under it). Every call site already has this phrase sitting right above the list; pass it through
   *  rather than inventing a second copy of it here. */
  readonly capabilitiesLabel: string;
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
}

function GrantRow({ capability, checked, isNew }: GrantRowProps): ReactElement | null {
  const nameId = useId();
  const newMarkId = useId();
  const consequenceId = useId();
  const copy = capabilityCopy(capability);
  if (copy === undefined) {
    return null;
  }
  // The accessible name, as an EXPLICIT node list (see the file header): the label, plus the "New" pill on a
  // re-consent row. Explicit beats the one Base UI derives from the wrapping `<label htmlFor>`, which is what
  // silently swallowed the pills and the consequence.
  const nameIds = isNew ? `${nameId} ${newMarkId}` : nameId;
  const labelBlock = (
    // NO `cursor-pointer` ANY MORE (#1855): it rode the editable arm, where the whole block was the toggle's
    // hit target. Nothing here is clickable, and a pointer cursor over a statement is the same false
    // affordance the disabled-checkbox finding (#650 P1-3) is about, one property down.
    <Stack gap="tight">
      <Row align="center" className="flex-wrap" gap="field">
        <Text id={nameId} voice="label">
          {copy.label}
        </Text>
        {/* An UNGRANTED row's state, as a word beside the name it refuses — adjacent, where the far-docked
            control column used to strand it (file header). */}
        {checked ? null : (
          <Text className="text-muted-foreground" voice="label">
            Not granted
          </Text>
        )}
        {/* "New" reads INFO (informational — this row changed) against "Costs money"'s WARNING (a real
            caution) — two amber "warning/soft" pills at a glance were indistinguishable (side-eye P2-8). */}
        {isNew ? (
          <Badge id={newMarkId} intent="info" size="sm" tone="soft">
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
      {/* The measure caps the consequence line (side-eye 2026-08-29 residual P2): inside the re-consent
          callout these ran edge-to-edge near ~90ch. THE TOKEN, NOT `max-w-prose` (#1175): Tailwind's utility
          is 65 CSS `ch`, and a CSS `ch` is the ZERO-GLYPH advance — 1.43-1.56 typographic characters in Geist
          — so 65ch reads 93-101 law characters and never satisfied the 65-75 band this comment used to claim
          it did. `--reading-measure-prose` (47ch) is the derived teaching/body measure (#1145), and it rides
          the PARAGRAPH because a `ch` resolves in the element's own font. */}
      <Text className="max-w-(--reading-measure-prose)" id={consequenceId} prose={true} voice="gloss">
        {copy.consequence}
      </Text>
    </Stack>
  );
  return (
    <Row align="start" gap="row">
      {/* THE LEAD COLUMN: the control, adjacent to its words. A GRANTED row keeps the checkbox ("you already
          have this" is a true state, not a false affordance — its ≥44px touch pseudo is moot, it is
          disabled); an UNGRANTED row gets a `w-checkbox` spacer so mixed rows keep one left rail, with the
          "Not granted" word-mark on the label row above (P1-3, see the file header). */}
      {checked ? (
        <Checkbox aria-describedby={consequenceId} aria-labelledby={nameIds} checked={true} disabled={true} />
      ) : (
        <Stack aria-hidden={true} className="w-checkbox shrink-0" />
      )}
      <Stack className="min-w-0 flex-1">{labelBlock}</Stack>
    </Row>
  );
}

/** The reach list — always read-only (#1855: the consent decision is approve-all or deny, never per row).
 *  Drawn at three moments: the install confirm, the upgrade re-consent notice, and an installed row's
 *  "what it can do" disclosure. */
export function PluginGrantList({
  declared,
  netHosts,
  granted,
  addedCapabilities,
  addedNetHosts,
  netHostsHeading = "Hosts it can reach",
  capabilitiesLabel,
}: PluginGrantListProps): ReactElement {
  const grantedSet = new Set<PluginCapability>(granted);
  const addedSet = new Set<PluginCapability>(addedCapabilities ?? []);
  const addedHostSet = new Set<string>(addedNetHosts ?? []);
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
            <GrantRow key={capability} capability={capability} checked={grantedSet.has(capability)} isNew={addedSet.has(capability)} />
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
              guarantee above it are what a person actually decides on.

              The "New" mark rides the LIST ITEM, so it is read out beside the hostname it belongs to rather
              than as a floating badge — the same reason the capability mark rides that row's accessible
              name, and the same word, never a colour. Marked hosts are exactly `addedNetHosts` and nothing
              is inferred here: the whole list still renders, because consent to an exact-host allowlist is
              consent to the SET, and the mark only says which members of it are new. */}
          <Stack gap="tight" role="list">
            {netHosts.map((host) => (
              <Row key={host} align="center" gap="field" role="listitem">
                <Text voice="datumMono">{host}</Text>
                {addedHostSet.has(host) ? (
                  <Badge intent="info" size="sm" tone="soft">
                    New
                  </Badge>
                ) : null}
              </Row>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
