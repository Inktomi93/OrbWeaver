// The ACTIONS view's CONTEXT readout (preset-surface-redesign.md §7): the DELIVERY PATH + the RESOLVED PREVIEW.
//
// The question the delivery path answers is the one the Actions view itself cannot: "will my customized
// template actually LAND, and where in the prompt?" A guided steer rides the `guided_instruction` MARKER — if
// that marker is off, or was never placed, every template in the list is a well-written string that goes
// nowhere. The §6 cross-link is therefore PROMOTED here from a chip you have to notice into a standing
// readout, with its health, its zone, and its position in the current arrangement.
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
//   owns that resolution (Ruling B: the editor displays a chat-side answer, it never re-derives one). The two
//   FIRE-TIME tokens survive as tokens: `{{input}}` is the steer you have not typed and `{{person}}` the
//   perspective you have not picked, so substituting either would fabricate a value — the one thing §7's
//   honesty pin forbids. The gloss NAMES what resolved and through what, so the reader can tell a real
//   resolution from a claimed one.
//
//   UNBOUND: the chat-free token view — the template with every macro chipped and unresolved. This is the
//   `{planned}`-free floor, not a degradation: it states the CONDITION under which the tokens fill in
//   ([[empty-states-are-load-bearing]]).

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
import { openSectionInPrompt } from "../../lib/preset-nav";
import type { TemplateRow } from "../../lib/template-rows";
import { templatePreview, templateRowById } from "../../lib/template-rows";
import { MacroText } from "../macro-text";
import { deriveZones } from "../prompt-assembly/derive-zones";
import { DatumRow } from "./readout-parts";

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

export function ActionsReadout({ sections, presetId, boundChatId, templateText }: ActionsReadoutProps): ReactElement {
  const index = sections.findIndex((section) => section.type === "marker" && section.marker === "guided_instruction");
  const marker = index === -1 ? undefined : sections[index];
  const preview = <ResolvedPreview boundChatId={boundChatId} presetId={presetId} templateText={templateText} />;
  if (marker === undefined) {
    return (
      <Stack gap="section">
        <Section kicker="Delivery path">
          <Row align="center" gap="field">
            <Text voice="label">Guided instruction</Text>
            <Badge intent="warning" size="sm">
              absent
            </Badge>
          </Row>
          <Text voice="gloss">
            No Guided instruction marker is placed, so a steer has nowhere to land — every template below resolves and is then dropped. Add the marker from the
            rack's Add menu in the Prompt view.
          </Text>
        </Section>
        {preview}
      </Stack>
    );
  }
  const zones = deriveZones(sections);
  return (
    <Stack gap="section">
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
      {preview}
    </Stack>
  );
}

/** WHICH template the preview describes: the row the reader selected, else the FIRST registry row. A default
 *  rather than an empty state, because the panel's job is to be useful before anything is clicked — and the
 *  registry's own order is the same one the list renders, so the default is the row at the top of the pane.
 *  A STALE id (a def that has since left the registry) falls to the same default rather than blanking. */
function useSelectedTemplateRow(): TemplateRow | undefined {
  const selected = useSelectedPresetTemplateId();
  const picked = selected === null ? undefined : templateRowById(selected);
  // `TEMPLATE_DEFS` is a non-empty const tuple, so the default row always exists — no empty-registry arm to fake.
  return picked ?? templateRowById(TEMPLATE_DEFS[0].id);
}

function ResolvedPreview({
  presetId,
  boundChatId,
  templateText,
}: {
  readonly presetId: PresetId;
  readonly boundChatId: ChatId | null;
  readonly templateText: (id: string) => string;
}): ReactElement | null {
  const row = useSelectedTemplateRow();
  if (row === undefined) {
    // The registry is empty — an unreachable product state, and a kicker over nothing is chrome.
    return null;
  }
  return (
    <Section kicker={`Resolved — ${row.def.label}`}>
      {boundChatId === null ? (
        <UnboundPreview row={row} templateText={templateText} />
      ) : (
        <BoundPreview chatId={boundChatId} presetId={presetId} templateId={row.def.id} />
      )}
    </Section>
  );
}

/** The chat-free arm: the template as AUTHORED, macros chipped and unresolved, with the condition that fills
 *  them in stated. Reads the preset's own saved bytes (falling back to the factory default the row ghosts), so
 *  the preview and the Actions row can never show two different templates. */
function UnboundPreview({ row, templateText }: { readonly row: TemplateRow; readonly templateText: (id: string) => string }): ReactElement {
  const text = templatePreview(templateText(row.def.id), row.factoryDefault);
  return (
    <Stack gap="tight">
      <MacroText tokens={scanMacroRuns(text)} />
      <Text voice="gloss">Every macro here resolves in chat — open a chat and this readout binds to it, showing what the model actually receives.</Text>
    </Stack>
  );
}

/** The BOUND arm — the ONE `previewActionTemplates` read, projected. The read answers for the WHOLE registry
 *  in one round trip, so switching the selected row re-projects a cached answer instead of refetching. */
function BoundPreview({ chatId, presetId, templateId }: { readonly chatId: ChatId; readonly presetId: PresetId; readonly templateId: string }): ReactElement {
  const trpc = useTRPC();
  const preview = useQuery(trpc.chat.previewActionTemplates.queryOptions({ chatId, presetId }));
  const resolved = preview.data?.templates.find((template) => template.id === templateId)?.resolved;
  if (resolved === undefined) {
    return <Text voice="gloss">{preview.isError ? "This chat cannot be inspected — its host resolves the prompt, and you are not it." : "Resolving…"}</Text>;
  }
  const runs = scanMacroRuns(resolved);
  return (
    <Stack gap="tight">
      <Stack data-testid={testId("presetResolvedPreview")} gap="tight">
        <MacroText tokens={runs} />
      </Stack>
      <Text voice="gloss">{boundGloss(runs, preview.data?.identity.user)}</Text>
    </Stack>
  );
}

/** THE GLOSS NAMES THE RESOLUTION, it does not claim one: what `{{user}}` became, and which tokens
 *  deliberately did NOT resolve. A reader can audit the panel from this one line.
 *
 *  The surviving tokens are DERIVED from the rendered text, never a hardcoded pair: everything the chat could
 *  resolve, it did, so whatever is left IS the fire-time set — and deriving it keeps the sentence true per
 *  TEMPLATE (a nudge carries no `{{input}}`, and claiming otherwise on its own panel would be a small lie on
 *  the surface whose entire job is not telling them). */
function boundGloss(runs: readonly MacroRun[], user: string | undefined): string {
  const names: readonly string[] = runs.filter((run) => run.kind === "macro").map((run) => `{{${run.value}}}`);
  const remaining: readonly string[] = [...new Set(names)];
  const bound = user === undefined ? "bound to this chat" : `bound: {{user}} resolves through the chat ("${user}")`;
  const fireTime = remaining.length === 0 ? "" : ` · ${remaining.join(" ")} stay fire-time tokens — they fill in when you click`;
  return `${bound}${fireTime} · settle-live`;
}

// The token renderer is `../macro-text` — ONE braced-chip spelling for the whole surface (side-eye F-1
// ruling 1). This panel's chips were already braced and correct; the assembled preview's were bare, and
// unifying them is what makes the rule a property of the surface instead of of this file.
