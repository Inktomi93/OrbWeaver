// The ACTIONS view's CONTEXT readout (preset-surface-redesign.md §7): the DELIVERY PATH + the RESOLVED PREVIEW.
//
// THE DELIVERY PATH IS PER-KIND (the Actions-tab IA §2.3 — UI-Arch §4.2, CONTEXT is config OF the active
// artifact). It used to be a STANDING marker cluster: every selected row — a guided steer, a game-turn teach,
// an extraction tool description — got the byte-identical "Guided instruction · position SETUP · role system",
// which is a FALSE path for everything outside the guided family (a teach rides the game turn's steering
// reminder; an extract row rides the state round and never enters the chat prompt at all). The dispatch is the
// house exhaustive Record over `TemplateKind` (`TEMPLATE_KIND_DELIVERY`, template-rows.ts — derived from the
// LIVE assembly code, receipts in the design doc §1): the guided kinds keep the marker cluster, every other
// kind states its own truth, and a NEW kind fails `tsc` until its delivery is stated.
//
// The marker-name click is a sanctioned NAVIGATION echo (§16 row 19) through `openSectionInPrompt` — the
// ONE cross-view section door: it switches to the PROMPT view AND selects the marker's rack row, which is
// exactly what this panel's own note promises. Selecting alone left the reader in Actions with nothing
// visibly changed (crunch-list O-13).
//
// THE RESOLVED PREVIEW (D8 / §7.1) answers the second question — "what does the model actually receive when I
// fire this?" — and it has TWO honest arms, never a blank one:
//
//   BOUND: with a chat bound (the auto-bind above the panel), the SELECTED template is rendered by the CHAT
//   through the one `previewActionTemplates` read. Identity macros resolve for REAL, because the chat is what
//   owns that resolution (Ruling B: the editor displays a chat-side answer, it never re-derives one). The
//   FIRE-TIME tokens survive as tokens: `{{input}}` is the steer you have not typed and `{{person}}` the
//   perspective you have not picked, so substituting either would fabricate a value — the one thing §7's
//   honesty pin forbids. The gloss NAMES what resolved and through what, so the reader can tell a real
//   resolution from a claimed one — and its deferred-token TAIL is per-kind too ("when you fire the action"
//   is only true of a row a user fires; an extract row's tokens are DATA the seam splices at the state
//   round, which the chat macro engine passes through untouched by design).
//
//   UNBOUND: the chat-free token view — the template with every macro chipped and unresolved. This is the
//   `{planned}`-free floor, not a degradation: it states the CONDITION under which the tokens fill in
//   ([[empty-states-are-load-bearing]]) — per kind, because "every macro here resolves in chat" was only
//   ever true of the guided family.

import type { PromptSection } from "@orb/contracts/preset";
import { TEMPLATE_DEFS } from "@orb/contracts/preset";
import type { ChatId, PresetId } from "@orb/kit/ids";
import type { MacroRun } from "@orb/kit/macro";
import { scanMacroRuns } from "@orb/kit/macro";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { useSelectedPresetTemplateId } from "#state";
import { openSectionInPrompt } from "../../lib/preset-nav.ts";
import type { TemplateRow } from "../../lib/template-rows.ts";
import { TEMPLATE_KIND_DELIVERY, TEMPLATE_KIND_FIRE_TIME, TEMPLATE_KIND_UNBOUND_GLOSS, templatePreview, templateRowById } from "../../lib/template-rows.ts";
import { MacroText } from "../macro-text.tsx";
import { deriveZones } from "../prompt-assembly/derive-zones.ts";
import { DatumRow } from "./readout-parts.tsx";

export interface ActionsReadoutProps {
  readonly sections: readonly PromptSection[];
  /** The preset being inspected — the `presetOverride` half of the bound read (assemble the bound chat as if
   *  THIS preset were active), so the preview describes what you are editing, not what the room adopted. */
  readonly presetId: PresetId;
  /** The bound chat, or `null` for the unbound/dismissed arm. Resolved once by the readout and threaded down:
   *  the binding is ONE state with ONE home, never re-derived per panel. */
  readonly boundChatId: ChatId | null;
  /** The template whose delivery this preset stores — read off the form's saved config so the preview shows
   *  the same bytes the row does when nothing is bound. */
  readonly templateText: (id: string) => string;
}

export function ActionsReadout({ sections, presetId, boundChatId, templateText }: ActionsReadoutProps): ReactElement | null {
  const row = useSelectedTemplateRow();
  if (row === undefined) {
    // The registry is empty — an unreachable product state, and a kicker over nothing is chrome.
    return null;
  }
  const delivery = TEMPLATE_KIND_DELIVERY[row.def.kind];
  return (
    <Stack gap="section">
      {delivery.kind === "marker" ? (
        <MarkerDeliveryPath sections={sections} />
      ) : (
        // The kind's own truth (IA §2.3): the channel datum where the marker arm names the marker, the class
        // sentence, and the SELECTED row's own firing condition as the specific — the delivery section is
        // per-row now, and a reader may have scrolled the list away.
        <Section kicker="Delivery path">
          <Row align="center" gap="field">
            <Text voice="label">{delivery.channel}</Text>
          </Row>
          <Text voice="gloss">{delivery.body}</Text>
          <Text voice="gloss">This row — {row.def.fires}.</Text>
        </Section>
      )}
      <Section kicker={`Resolved — ${row.def.label}`}>
        {boundChatId === null ? <UnboundPreview row={row} templateText={templateText} /> : <BoundPreview chatId={boundChatId} presetId={presetId} row={row} />}
      </Section>
    </Stack>
  );
}

/** The `guided_instruction` MARKER cluster — the guided family's delivery truth: a system-role steer rides
 *  the marker, so its health/position/role IS "will my customized template actually land". Verbatim the
 *  standing cluster this panel always drew; it just stopped rendering for rows that never ride it. */
function MarkerDeliveryPath({ sections }: { readonly sections: readonly PromptSection[] }): ReactElement {
  const index = sections.findIndex((section) => section.type === "marker" && section.marker === "guided_instruction");
  const marker = index === -1 ? undefined : sections[index];
  if (marker === undefined) {
    return (
      <Section kicker="Delivery path">
        <Row align="center" gap="field">
          <Text voice="label">Guided instruction</Text>
          <Badge intent="warning" size="sm">
            absent
          </Badge>
        </Row>
        <Text voice="gloss">
          No Guided instruction marker is placed, so a steer has nowhere to land — every guided template resolves and is then dropped. Add the marker from the
          rack's Add menu in the Prompt view.
        </Text>
      </Section>
    );
  }
  const zones = deriveZones(sections);
  return (
    <Section kicker="Delivery path">
      <Row align="center" gap="field">
        <Button intent="ghost" onClick={(): void => openSectionInPrompt(marker.id)} size="sm" type="button">
          <Text voice="label">Guided instruction</Text>
        </Button>
        <Badge intent={marker.enabled ? "success" : "warning"} size="sm">
          {marker.enabled ? "on" : "off"}
        </Badge>
      </Row>
      <Stack gap="tight">
        <DatumRow label="position" value={`${zones.zoneOf(index).toUpperCase()} · ${String(index + 1)} of ${String(sections.length)}`} />
        {/* ONE VOCABULARY with both drill-ins (O-10★): the field is "Role" there, so the datum is `role`
            here — "delivered as" was the third spelling of one thing. */}
        <DatumRow label="role" value={marker.role} />
      </Stack>
      <Text voice="gloss">
        {marker.enabled
          ? "Clicking the name opens that row in Prompt."
          : "The marker is switched OFF — a steer resolves and is then dropped. Turn it back on from its rack row."}
      </Text>
    </Section>
  );
}

/** WHICH template the panel describes: the row the reader selected, else the FIRST registry row. A default
 *  rather than an empty state, because the panel's job is to be useful before anything is clicked — and the
 *  registry's own order is the same one the list renders, so the default is the row at the top of the pane.
 *  A STALE id (a def that has since left the registry) falls to the same default rather than blanking. */
function useSelectedTemplateRow(): TemplateRow | undefined {
  const selected = useSelectedPresetTemplateId();
  const picked = selected === null ? undefined : templateRowById(selected);
  // `TEMPLATE_DEFS` is a non-empty const tuple, so the default row always exists — no empty-registry arm to fake.
  return picked ?? templateRowById(TEMPLATE_DEFS[0].id);
}

/** The chat-free arm: the template as AUTHORED, macros chipped and unresolved, with the condition that fills
 *  them in stated PER KIND (`TEMPLATE_KIND_UNBOUND_GLOSS` — the old standing sentence claimed chat-macro
 *  resolution for rows whose tokens are extraction-seam DATA). Reads the preset's own saved bytes (falling
 *  back to the factory default the row ghosts), so the preview and the Actions row can never show two
 *  different templates. */
function UnboundPreview({ row, templateText }: { readonly row: TemplateRow; readonly templateText: (id: string) => string }): ReactElement {
  const text = templatePreview(templateText(row.def.id), row.factoryDefault);
  return (
    <Stack gap="tight">
      <MacroText tokens={scanMacroRuns(text)} />
      <Text voice="gloss">{TEMPLATE_KIND_UNBOUND_GLOSS[row.def.kind]}</Text>
    </Stack>
  );
}

/** The BOUND arm — the ONE `previewActionTemplates` read, projected. The read answers for the WHOLE registry
 *  in one round trip, so switching the selected row re-projects a cached answer instead of refetching. */
function BoundPreview({ chatId, presetId, row }: { readonly chatId: ChatId; readonly presetId: PresetId; readonly row: TemplateRow }): ReactElement {
  const trpc = useTRPC();
  const preview = useQuery(trpc.chat.previewActionTemplates.queryOptions({ chatId, presetId }));
  const resolved = preview.data?.templates.find((template) => template.id === row.def.id)?.resolved;
  if (resolved === undefined) {
    return <Text voice="gloss">{preview.isError ? "This chat cannot be inspected — its host resolves the prompt, and you are not it." : "Resolving…"}</Text>;
  }
  const runs = scanMacroRuns(resolved);
  return (
    <Stack gap="tight">
      <Stack data-testid={testId("presetResolvedPreview")} gap="tight">
        <MacroText tokens={runs} />
      </Stack>
      <Text voice="gloss">{boundGloss(runs, preview.data?.identity.user, TEMPLATE_KIND_FIRE_TIME[row.def.kind])}</Text>
    </Stack>
  );
}

/** THE GLOSS NAMES THE RESOLUTION, it does not claim one: what `{{user}}` became, and which tokens
 *  deliberately did NOT resolve. A reader can audit the panel from this one line.
 *
 *  The surviving tokens are DERIVED from the rendered text, never a hardcoded pair: everything the chat could
 *  resolve, it did, so whatever is left IS the deferred set — and deriving it keeps the sentence true per
 *  TEMPLATE (a nudge carries no `{{input}}`, and claiming otherwise on its own panel would be a small lie on
 *  the surface whose entire job is not telling them). WHEN they fill is the per-kind `fireTime` phrase: "when
 *  you fire the action" is a click-family fact; an extract row's tokens splice at the state round. */
function boundGloss(runs: readonly MacroRun[], user: string | undefined, fireTime: string): string {
  const names: readonly string[] = runs.filter((run) => run.kind === "macro").map((run) => `{{${run.value}}}`);
  const remaining: readonly string[] = [...new Set(names)];
  const bound = user === undefined ? "bound to this chat" : `bound: {{user}} resolves through the chat ("${user}")`;
  const deferred = remaining.length === 0 ? "" : ` · ${remaining.join(" ")} stay deferred — ${fireTime}`;
  return `${bound}${deferred} · settle-live`;
}

// The token renderer is `../macro-text` — ONE braced-chip spelling for the whole surface (side-eye F-1
// ruling 1). This panel's chips were already braced and correct; the assembled preview's were bare, and
// unifying them is what makes the rule a property of the surface instead of of this file.
