// C5 — the OWNER-GLOBAL automation sections: the bodies of the Automation config group's two contributed
// sections (interaction-direction-spec §7 C5, "the global rules surface: list + picker + budget";
// config-revamp-design.md §6.8 — each is an anchored, heading-bearing `<Section>` with its OWN
// `QueryBoundary`, so a slow or failed budget read cannot blank the rule list beside it and the reverse).
//
// WHAT MAKES THEM A DIFFERENT SURFACE FROM THE CHAT RULES SECTION is exactly three things, and everything
// else is deliberately the same component:
//   1. the READ is `listOwnerRules` — no id, because the plane is single-owned (the caller IS the scope);
//   2. the PICKER is handed `chatId: null`, which filters the catalogue to the presets that declare
//      `scope: "global"` and hands the mint a chat-less scope;
//   3. it owns the OWNER rate ceiling — the belt every chat-less rule of this author counts against, which
//      has no per-chat equivalent because `automation_budgets` is keyed by chat.
//
// NO LIVE FEED, said out loud rather than left to be noticed. `AutomationBusEvent` is the per-CHAT bus, so
// an owner-global rule's fire reaches no subscriber and this list has nothing to subscribe to; it reconciles
// through each mutation's own `invalidates` (`lib/rule-mutations.ts`). A rule that fires from a real library
// event therefore updates its "Last ran" line on the next read rather than live — the fire LOG under each
// row is durable and always current when opened, which is where "did it run" is actually answered.

import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { AUTOMATION_BUDGET_SUBCATEGORY, AUTOMATION_RULES_SUBCATEGORY } from "../lib/automation-nav.ts";
import { useSetOwnerBudgets } from "../lib/owner-budget-mutations.ts";
import { RulePresetPicker } from "./rule-preset-picker.tsx";
import { RuleRow } from "./rule-row.tsx";

/** One row of the rule list — tRPC-inferred, so a wire reshape breaks here at compile time. Declared per
 *  consumer rather than exported from `rule-row.tsx`: a feature `components/` file is not a type home
 *  (`no-inline-types`), and the client feature tree has no `contract/` to move it to. The alias is one line
 *  off the SAME inferred source in both places, so the two cannot drift. */
type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];

/** The owner ceiling's editable range. 0 is a real, useful value — "stop all of my library rules" without
 *  disabling them one by one — and the top is the same 240/hour ceiling a single rule may carry, because a
 *  belt that can be set below the thing it bounds is a belt that reads as broken. */
const OWNER_CAP_MIN = 0;
const OWNER_CAP_MAX = 240;

/** The rate ceiling every owner-global rule counts against — the anchored section. */
export function OwnerBudgetSection(): ReactElement {
  return (
    <Section divider={true} heading={AUTOMATION_BUDGET_SUBCATEGORY.label} id={configAnchorId("automation", AUTOMATION_BUDGET_SUBCATEGORY.id)}>
      <QueryBoundary
        fallback={<SkeletonRows count={1} shape="line" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your automation limit" onRetry={retry} />}
        reserveKey="config.automation.budget"
      >
        <OwnerBudgetBody />
      </QueryBoundary>
    </Section>
  );
}

/** The ceiling COMMITS ON BLUR / Enter with the FINAL value (`onValueCommitted`, the Base UI commit seam the
 *  talkativeness popover uses) rather than on every keystroke: this is a BELT, and a half-typed number
 *  briefly meaning "3" instead of "30" must never persist as a clamp the host did not mean. That guarantee
 *  used to be an explicit "Save limit" button; on-blur keeps it (the ruling survives — its MECHANISM changed)
 *  while matching the settings-surface norm every other numeric knob follows and dropping the button's own
 *  misalignment along with it. NO optimistic patch: the belt reads the authoritative ceiling, so a failed
 *  (non-optimistic) write or an other-device change re-seeds the input rather than briefly showing a bound
 *  the server has not accepted. */
function OwnerBudgetBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: budget } = useSuspenseQuery(trpc.automation.getOwnerBudgets.queryOptions());
  const save = useSetOwnerBudgets({ trpc, invalidation });
  // The IN-PROGRESS edit only; `null` means "not editing", so the field reads the authoritative ceiling and a
  // failed write or a foreign change re-seeds it (the talkativeness-popover precedent). Cleared on commit so
  // the server value re-takes.
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? budget.maxFiresPerHour;
  const clamp = (next: number): number => Math.min(Math.max(next, OWNER_CAP_MIN), OWNER_CAP_MAX);

  return (
    <Stack gap="block">
      <Text voice="gloss">
        A safety limit across all of your library-wide rules together, so a rule that starts repeating cannot keep spending. Each rule also has its own per-hour
        limit.
      </Text>
      {/* NO `aria-label` on the control: an `@orb/ui` NumberField inside a `Field` is a Base UI TEXTBOX
          already NAMED by the Field's own label (and described by its description), so a second name here
          would override the association rather than add to it — the house convention every other numeric
          knob in settings follows. */}
      <Field label="Runs per hour" orientation="vertical" description="Across every library-wide rule you have.">
        <NumberField
          min={OWNER_CAP_MIN}
          max={OWNER_CAP_MAX}
          value={value}
          // Display only — the in-progress edit, clamped for the field but NEVER persisted here (that is the
          // mid-type guarantee: typing `5` en route to `50` moves the draft, not the belt).
          onValueChange={(next): void => setDraft(next === null ? null : clamp(next))}
          // The commit: fires on blur, on Enter (see `onKeyDown`), and on stepper/scrub release with the
          // FINAL value. Empty reverts to the current ceiling; only a real change writes.
          onValueCommitted={(next): void => {
            const settled = next === null ? budget.maxFiresPerHour : clamp(next);
            setDraft(null);
            if (settled !== budget.maxFiresPerHour) {
              save.mutate({ maxFiresPerHour: settled });
            }
          }}
          // Enter is a NAVIGATE key for Base UI's NumberField (it does not commit on its own), so blur the
          // input to route Enter through the same single commit path as clicking away.
          onKeyDown={(event): void => {
            if (event.key === "Enter" && event.target instanceof HTMLElement) {
              event.target.blur();
            }
          }}
        />
      </Field>
    </Stack>
  );
}

/** The owner-global rule list + the "Add a rule" picker for the global half of the catalogue — the anchored
 *  section. */
export function OwnerRulesSection(): ReactElement {
  return (
    <Section divider={true} heading={AUTOMATION_RULES_SUBCATEGORY.label} id={configAnchorId("automation", AUTOMATION_RULES_SUBCATEGORY.id)}>
      <QueryBoundary
        fallback={<SkeletonRows count={3} shape="line" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your library-wide rules" onRetry={retry} />}
        reserveKey="config.automation.rules"
      >
        <OwnerRulesBody />
      </QueryBoundary>
    </Section>
  );
}

function OwnerRulesBody(): ReactElement {
  const trpc = useTRPC();
  const { data: rules } = useSuspenseQuery(trpc.automation.listOwnerRules.queryOptions());

  return (
    <Stack gap="section">
      {/* The one-line gloss both rule surfaces open with, saying what is DIFFERENT here: these rules watch
          the library, not a room. */}
      <Text voice="gloss">These rules watch your library and act on their own — no chat has to be open.</Text>
      {rules.length === 0 ? (
        <Text voice="gloss">
          Nothing is watching your library yet. Add a rule — illustrate a character when its card changes, for instance — and it starts off until you enable it.
        </Text>
      ) : (
        <Stack gap="section">
          {rules.map((rule: Rule, index: number) => (
            <Stack key={rule.id} gap="section">
              {index === 0 ? null : <Separator />}
              {/* `chatId: null` IS the scope — it reaches the mutations, where it addresses this list for
                  the settle invalidate rather than a room's. */}
              <RuleRow chatId={null} rule={rule} />
            </Stack>
          ))}
        </Stack>
      )}
      <RulePresetPicker chatId={null} />
    </Stack>
  );
}
