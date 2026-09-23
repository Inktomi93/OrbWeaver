// The GM console's SCALAR autosave form (extracted from rpg-game-tab.tsx for the component-size cap):
// Play style (CYOA switch + the compose|send segmented choice-click knob + plot steering) → Immersive
// cards (the teaching gate + its interactivity sub-toggle + the keep-last-X wire knob) → Hidden
// channels (the two teaching gates + the host reveal-eye offer) → Prompt budget (the reminder's
// recent-beats slice) → Steering note →
// Delivery model (the mock's SEGMENTED mode toggle with its honest consequence line — never a resting
// dropdown) → Extraction depth (the evidence trio). Everything autosaves (D66 A4). The
// section ORDER inside this form is the tail of the mock's console order (game.html) — the array/record
// sub-editors render before it in rpg-game-tab.tsx.

import type { RpgConfigView, RpgDateMode, RpgExtractionContext, RpgExtractionMode } from "@orb/contracts/rpg";
import {
  RPG_CARD_KEEP_LAST_DEFAULT,
  RPG_EXTRACTION_CONTEXTS,
  RPG_EXTRACTION_MODES,
  RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT,
  RPG_EXTRACTION_WINDOW_TOKENS_MAX,
  RPG_EXTRACTION_WINDOW_TOKENS_MIN,
  RPG_RECENT_BEATS_KEEP_DEFAULT,
  RPG_RECONCILE_EVERY_BEATS_DEFAULT,
  RPG_RECONCILE_EVERY_BEATS_MAX,
  RPG_STEERING_NOTE_MAX,
} from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { createAutosaveEntityForm } from "#forms/editor";
import { useUpdateConfig } from "../hooks/use-rpg-mutations.ts";
import type { HostConsoleFormValues } from "../lib/host-console-form-model.ts";
import { EMPTY_HOST_CONSOLE_FORM, fromHostConsoleForm, toHostConsoleForm } from "../lib/host-console-form-model.ts";
import { Kicker } from "./rpg-kicker.tsx";

/** The honest one-line consequence per delivery mode (the mock's fact — the same freshness posture the
 *  band cue renders), keyed over the closed mode axis. */
const EXTRACTION_CONSEQUENCE: Readonly<Record<RpgExtractionMode, string>> = {
  folded: "the reply records its own state — ONE model call, fastest and cheapest (recommended)",
  cheap: "a second pass records state with tools after the turn — two model calls; recommended for local models",
};

/** The mode axis, rendered in order — derived from the closed tuple so a new delivery mode cannot be silently
 *  missing from the picker (a hardcoded pair once was, and the host had no way to reach the new arm). */
const EXTRACTION_MODE_OPTIONS: readonly RpgExtractionMode[] = RPG_EXTRACTION_MODES;

/** The segmented toggle hands back raw strings; narrow to the closed axis before writing the field. */
function asExtractionMode(value: string | undefined): RpgExtractionMode | null {
  return EXTRACTION_MODE_OPTIONS.find((mode) => mode === value) ?? null;
}

/** The CYOA choice-click consequence per behavior (the P5 knob the Scene echo + transcript obey). */
const CHOICE_BEHAVIOR_CONSEQUENCE: Readonly<Record<RpgConfigView["cyoaChoiceBehavior"], string>> = {
  compose: "a pick drops into the composer — edit before sending",
  send: "a pick sends immediately as your turn",
};

/** The extraction-CONTEXT consequence per arm — how much of the turn's own story the state round reads
 *  as evidence. Keyed over the closed axis, so a new context arm cannot ship without its honest cost line. */
const EXTRACTION_CONTEXT_CONSEQUENCE: Readonly<Record<RpgExtractionContext, string>> = {
  beat: "only the latest beat — the cheapest read, and the one most likely to miss what set the scene up",
  window: "the recent arc, up to the budget below — relationships and quests evolve instead of resetting",
  full: "the whole thread — the most inference, and the largest prompt every single beat",
};

/** The context axis in order, derived from the closed tuple (the delivery-picker precedent — a new arm cannot
 *  be silently missing from the segmented control). */
const EXTRACTION_CONTEXT_OPTIONS: readonly RpgExtractionContext[] = RPG_EXTRACTION_CONTEXTS;

/** The segmented toggle hands back raw strings; narrow to the closed axis before writing the field. */
function asExtractionContext(value: string | undefined): RpgExtractionContext | null {
  return EXTRACTION_CONTEXT_OPTIONS.find((context) => context === value) ?? null;
}

/** The #9 date-mode consequence lines (the choice-behavior segmented-toggle precedent). */
const DATE_MODE_CONSEQUENCE: Readonly<Record<RpgDateMode, string>> = {
  narrated: "The story narrates the date as free text — no day counter.",
  structured: "A running day counter shows beside the time of day.",
};

// The autosave scalar form (§13.4). Module scope (stable identity); keys its Session by `entityId` (the
// chatId) so a chat switch with the Game tab open is a full remount seeded from the new game's config.
const HostConsoleFormBoundary = createAutosaveEntityForm<HostConsoleFormValues>({
  defaultValues: EMPTY_HOST_CONSOLE_FORM,
});

/** The scalar autosave form — play style · hidden channels · steering note · delivery model. */
export function HostConsoleScalars({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const save = (values: HostConsoleFormValues): Promise<unknown> => {
    const { patch, extractionMode } = fromHostConsoleForm(values);
    return updateConfig.mutateAsync({ chatId, patch, extractionMode });
  };
  return (
    <HostConsoleFormBoundary entityId={`rpg-game:${chatId}`} serverValues={toHostConsoleForm(config)} save={save}>
      {({ form }): ReactElement => (
        <Stack gap="section">
          {/* gap="row" (8px), not the base `gap-field` (6px) — #850 fix-forward, measured LIVE (snap
              --eval on the isolated stage): each `SwitchField`'s hint-trigger sits ~2px from its field's
              own top edge, and its `size="inline"` touch-target `::after` overflows 8px past the icon's
              own edge at a fine pointer (28px pseudo centred on a 12px icon). At the base 6px `gap-field`
              pitch — between the Kicker and the first row AND between every pair of rows — the pseudo's
              overflow landed EXACTLY on the neighbour's edge (the Kicker's own label text for the FIRST
              row, the previous field's box for every row after it): a zero-margin graze that subpixel/DPR
              rounding tipped either way, which is why the audit flagged only some instances, not all of
              them, and why floating just the inter-ROW gap (leaving Kicker on the tighter pitch) still
              left the first row of every block capped. `gap="row"` on the WHOLE block (Kicker included)
              gives 2px of honest clearance everywhere instead of a coin flip. */}
          <Stack gap="row">
            <Kicker>Play style</Kicker>
            <form.AppField name="cyoa">
              {(field): ReactElement => (
                <field.SwitchField label="CYOA choices" hint="Every reply ends with a clickable set of choices — pick one to play it as your turn." />
              )}
            </form.AppField>
            {/* The compose|send choice-click knob — a SEGMENTED toggle with its consequence line,
                APPLICABILITY-shown only while CYOA is on (never a disabled twin). */}
            <form.AppField name="cyoa">
              {(cyoaField): ReactElement | null =>
                cyoaField.state.value ? (
                  <form.AppField name="cyoaChoiceBehavior">
                    {(field): ReactElement => (
                      <Row gap="block" align="center">
                        <ToggleGroup
                          aria-label="Choice click behavior"
                          value={[field.state.value]}
                          onValueChange={(next): void => {
                            const picked = next[0];
                            if (picked === "compose" || picked === "send") {
                              field.handleChange(picked);
                            }
                          }}
                        >
                          <Toggle value="compose">compose</Toggle>
                          <Toggle value="send">send</Toggle>
                        </ToggleGroup>
                        <Text voice="gloss" className="min-w-0 flex-1">
                          {CHOICE_BEHAVIOR_CONSEQUENCE[field.state.value]}
                        </Text>
                      </Row>
                    )}
                  </form.AppField>
                ) : null
              }
            </form.AppField>
            {/* The #9 ambient-date mode — a SEGMENTED toggle (narrated default: the model narrates the
                date as a freeform string, no day counter; structured keeps the integer day). Time-of-day
                + weather stay structured in both (the Waystone visual never turns off). */}
            <form.AppField name="dateMode">
              {(field): ReactElement => (
                <Row gap="block" align="center">
                  <ToggleGroup
                    aria-label="Ambient date mode"
                    value={[field.state.value]}
                    onValueChange={(next): void => {
                      const picked = next[0];
                      if (picked === "narrated" || picked === "structured") {
                        field.handleChange(picked);
                      }
                    }}
                  >
                    <Toggle value="narrated">narrated</Toggle>
                    <Toggle value="structured">structured</Toggle>
                  </ToggleGroup>
                  <Text voice="gloss" className="min-w-0 flex-1">
                    {DATE_MODE_CONSEQUENCE[field.state.value]}
                  </Text>
                </Row>
              )}
            </form.AppField>
            <form.AppField name="plotProgression">
              {(field): ReactElement => (
                <field.SwitchField
                  label="Plot steering"
                  hint="Adds a Plot submenu to the composer wand — one-shot story steers (twist, escalate, advance the act)."
                />
              )}
            </form.AppField>
          </Stack>

          {/* IMMERSIVE CARDS — both knobs shipped stored + wired and NEITHER had
              an editor: a host who did not want HTML in their prompt had no switch (owner dogfood 2026-07-31,
              the D107 dead-switch class). The pair is a DEPENDENCY, so it reads as one: the sub-toggle sits
              under its parent and goes DISABLED (not hidden) when the teaching is off — an interactivity ask
              with nothing to ask for is inapplicable, and the reason stays readable on its hint. */}
          {/* gap="row" — the Play style block's own fix-forward (same measured clearance defect,
              Kicker included so the FIRST row's collision with the Kicker's own label text clears too). */}
          <Stack gap="row">
            <Kicker>Immersive cards</Kicker>
            <form.AppField name="immersiveHtml">
              {(field): ReactElement => (
                <field.SwitchField
                  label="Immersive HTML cards"
                  hint="Teaches the model to answer with self-contained HTML cards (letters, notices, terminals) rendered in a sandbox. Off = the story stays plain prose; cards already in the chronicle keep rendering."
                />
              )}
            </form.AppField>
            <form.AppField name="immersiveHtml">
              {(htmlField): ReactElement => (
                <form.AppField name="immersiveHtmlInteractive">
                  {(field): ReactElement => (
                    <field.SwitchField
                      label="Allow interactivity in cards"
                      disabled={!htmlField.state.value}
                      hint={
                        htmlField.state.value
                          ? "Asks for animation and scripting inside those cards. Off = the calmer static table — still cards, no moving parts."
                          : "Needs immersive HTML cards on — there is no card ask to make interactive."
                      }
                    />
                  )}
                </form.AppField>
              )}
            </form.AppField>
            {/* The card WIRE knob, applicability-shown with its teaching parent: the newest X cards always
                ride the prompt in full, and older ones collapse to their `[card: title]` stub X at a time.
                The RENDER is untouched either way — this is prompt budget, not visibility. */}
            <form.AppField name="immersiveHtml">
              {(htmlField): ReactElement | null =>
                htmlField.state.value ? (
                  <form.AppField name="cardKeepLastX">
                    {(field): ReactElement => (
                      <field.NumberField
                        label="Cards kept whole in the prompt"
                        description={`This many of the newest cards always stay in full. Older cards collapse to a one-line stub, this many at a time. ${RPG_CARD_KEEP_LAST_DEFAULT} collapses every card right away, which costs the least. Each full card costs its whole length on every turn.`}
                        placeholder={`${RPG_CARD_KEEP_LAST_DEFAULT} (default)`}
                        min={0}
                      />
                    )}
                  </form.AppField>
                ) : null
              }
            </form.AppField>
          </Stack>

          {/* gap="row" — same fix-forward (measured clearance defect, Kicker included). */}
          <Stack gap="row">
            <Kicker crown={true}>Hidden channels — host only</Kicker>
            <form.AppField name="deception">
              {(field): ReactElement => (
                <field.SwitchField label="Deception" hint="Teach the model the <lie> channel — characters can hold standing secrets (the Veiled ledger)." />
              )}
            </form.AppField>
            <form.AppField name="omniscience">
              {(field): ReactElement => (
                <field.SwitchField label="Omniscience" hint="Teach the <ofilter> channel — the model can note events the party can't perceive." />
              )}
            </form.AppField>
            {/* The host's own REVEAL EYE. Stored + read by `revealHidden` since launch with no way to reach it
                (the D107 dead-switch class). It governs ONLY the host's peek: a member never reads hidden bytes
                either way, and the model always remembers what it hid — so the copy must not imply otherwise. */}
            <form.AppField name="hiddenContentReveal">
              {(field): ReactElement => (
                <field.SwitchField
                  label="Let me reveal hidden content"
                  hint="Off = you play blind too: no reveal eye, no standing-lies ledger, for you either. It changes nothing for members (they never see hidden content) and nothing for the model (it always remembers what it hid)."
                />
              )}
            </form.AppField>
          </Stack>

          {/* PROMPT BUDGET — the reminder's own slice knob. The durable log is untouched by it: the
              journal keeps every beat, this only bounds what the steering injection re-states each turn. */}
          <Stack gap="field">
            <Kicker>Prompt budget</Kicker>
            <form.AppField name="recentBeatsKeepLast">
              {(field): ReactElement => (
                <field.NumberField
                  label="Recent beats in the reminder"
                  description={`How many recent beats the game reminder re-states to the model each turn. 0 drops the block entirely. Nothing is deleted — the journal keeps the full record; this is only what rides the prompt. Default ${RPG_RECENT_BEATS_KEEP_DEFAULT}.`}
                  placeholder={`${RPG_RECENT_BEATS_KEEP_DEFAULT} (default)`}
                  min={0}
                />
              )}
            </form.AppField>
          </Stack>

          <Stack gap="field">
            <Kicker>Steering note — never shown to members</Kicker>
            <form.AppField name="steeringNote">
              {(field): ReactElement => (
                <field.TextareaField
                  label="Steering note"
                  hint={`An always-wins host directive spliced into the game reminder. Members never see it. Max ${RPG_STEERING_NOTE_MAX} chars.`}
                  rows={3}
                />
              )}
            </form.AppField>
          </Stack>

          <Stack gap="field">
            <Kicker>Delivery model</Kicker>
            {/* The mock's SEGMENTED toggle over the whole mode axis + its honest consequence line — never
                a resting dropdown. */}
            <form.AppField name="extractionMode">
              {(field): ReactElement => (
                <Row gap="block" align="center">
                  <ToggleGroup
                    aria-label="Delivery model"
                    value={[field.state.value]}
                    onValueChange={(next): void => {
                      const picked = asExtractionMode(next[0]);
                      if (picked !== null) {
                        field.handleChange(picked);
                      }
                    }}
                  >
                    {EXTRACTION_MODE_OPTIONS.map((mode) => (
                      <Toggle key={mode} value={mode}>
                        {mode}
                      </Toggle>
                    ))}
                  </ToggleGroup>
                  <Text voice="gloss" className="min-w-0 flex-1">
                    {EXTRACTION_CONSEQUENCE[field.state.value]}
                  </Text>
                </Row>
              )}
            </form.AppField>
            {/* RECOMMEND, NEVER FORCE ([[gen-settings-are-preset-owned]]): generation params belong to the
                preset, so the console STATES what the fold wants and leaves the lever where it lives. Shown on
                the folded arm only — a recommendation about a mode you aren't running is noise. */}
            <form.AppField name="extractionMode">
              {(field): ReactElement | null =>
                field.state.value === "folded" ? (
                  <Text voice="gloss">
                    Recommended with thinking turned OFF: the reply has to carry its own state calls, and a long reasoning pass tends to spend the turn thinking
                    instead of recording. That switch lives in your preset — this console never changes generation settings for you.
                  </Text>
                ) : null
              }
            </form.AppField>
          </Stack>

          {/* EXTRACTION DEPTH — the knobs that decide how much EVIDENCE the state round reads.
              Grouped under one kicker because they only make sense together: the context arm picks the shape,
              the token budget bounds the `window` arm (applicability-shown), and the cadence decides how often
              a beat re-states everything instead of just what changed.

              EXTRACT-BUDGET-DEAD — the CONTEXT knobs are APPLICABILITY-omitted on the `folded` arm. Folded has
              no separate extraction round: `buildFoldedTurnBuilder` mounts the tools onto the turn the model is
              already writing and reads only `config.trackers`; `buildExtractionUserPrompt` (the only consumer
              of `extractionContext`/`extractionWindowTokens`) has three callers and all three are non-folded.
              So the two controls governed nothing while claiming to govern the fold's economics — copy that was
              simply false. `reconcileEveryBeats` STAYS: it gates the `FOLDED_RECONCILE_NOTE` and works. */}
          <Stack gap="field">
            <Kicker>Extraction depth</Kicker>
            <form.AppField name="extractionMode">
              {(modeField): ReactElement =>
                modeField.state.value === "folded" ? (
                  <Text voice="gloss">
                    Folded delivery has no separate reading pass — the state calls ride the turn the model is already writing, so it sees exactly that turn's
                    own context. There is no window to size. The cadence below still applies.
                  </Text>
                ) : (
                  <Text voice="gloss">
                    How much of the story the state pass reads before it updates the panel. It rides the turn's own transcript — no extra reads — so the cost is
                    prompt size, not model calls.
                  </Text>
                )
              }
            </form.AppField>
            <form.AppField name="extractionMode">
              {(modeField): ReactElement | null =>
                modeField.state.value === "folded" ? null : (
                  <Stack gap="field">
                    <form.AppField name="extractionContext">
                      {(field): ReactElement => (
                        <Row gap="block" align="center">
                          <ToggleGroup
                            aria-label="Extraction context"
                            value={[field.state.value]}
                            onValueChange={(next): void => {
                              const picked = asExtractionContext(next[0]);
                              if (picked !== null) {
                                field.handleChange(picked);
                              }
                            }}
                          >
                            {EXTRACTION_CONTEXT_OPTIONS.map((context) => (
                              <Toggle key={context} value={context}>
                                {context}
                              </Toggle>
                            ))}
                          </ToggleGroup>
                          <Text voice="gloss" className="min-w-0 flex-1">
                            {EXTRACTION_CONTEXT_CONSEQUENCE[field.state.value]}
                          </Text>
                        </Row>
                      )}
                    </form.AppField>
                    {/* The window budget is the `window` arm's own knob — APPLICABILITY-shown, never a disabled twin. */}
                    <form.AppField name="extractionContext">
                      {(contextField): ReactElement | null =>
                        contextField.state.value === "window" ? (
                          <form.AppField name="extractionWindowTokens">
                            {(field): ReactElement => (
                              <field.NumberField
                                label="Window budget (tokens)"
                                description={`How far back the recent arc reaches, sliced on whole messages. ${RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT} ≈ 10–16 typical beats. Range ${RPG_EXTRACTION_WINDOW_TOKENS_MIN}–${RPG_EXTRACTION_WINDOW_TOKENS_MAX}; raise it on a hosted model, keep it low on a small local one.`}
                                placeholder={`${RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT} (default)`}
                                min={RPG_EXTRACTION_WINDOW_TOKENS_MIN}
                                max={RPG_EXTRACTION_WINDOW_TOKENS_MAX}
                                step={512}
                              />
                            )}
                          </form.AppField>
                        ) : null
                      }
                    </form.AppField>
                  </Stack>
                )
              }
            </form.AppField>
            <form.AppField name="reconcileEveryBeats">
              {(field): ReactElement => (
                <field.NumberField
                  label="Re-state everything every N beats"
                  description={`Every Nth beat, the pass re-emits the whole scene and present characters instead of only what changed — so a long story's panel self-heals instead of drifting. 0 turns it off. That beat costs more; 1 would make every beat the expensive one. Range 0–${RPG_RECONCILE_EVERY_BEATS_MAX}, default ${RPG_RECONCILE_EVERY_BEATS_DEFAULT}.`}
                  placeholder={`${RPG_RECONCILE_EVERY_BEATS_DEFAULT} (default)`}
                  min={0}
                  max={RPG_RECONCILE_EVERY_BEATS_MAX}
                />
              )}
            </form.AppField>
          </Stack>
        </Stack>
      )}
    </HostConsoleFormBoundary>
  );
}
