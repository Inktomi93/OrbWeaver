// C5 — the OWNER-GLOBAL automation surface: the body of the Automation settings pane
// (interaction-direction-spec §7 C5, "the global rules surface: list + picker + budget").
//
// WHAT MAKES IT A DIFFERENT SURFACE FROM THE CHAT RULES SECTION is exactly three things, and everything
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

import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { settingsAnchorId } from "#state";
import { useSetOwnerBudgets } from "../lib/owner-budget-mutations.ts";
import { RulePresetPicker } from "./rule-preset-picker.tsx";
import { RuleRow } from "./rule-row.tsx";

/** One row of the rule list — tRPC-inferred, so a wire reshape breaks here at compile time. Declared per
 *  consumer rather than exported from `rule-row.tsx`: a feature `components/` file is not a type home
 *  (`no-inline-types`), and the client feature tree has no `contract/` to move it to. The alias is one line
 *  off the SAME inferred source in both places, so the two cannot drift. */
type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];

/** The pane's two anchored sections — the ids the settings host's nav and scroll-spy address them by. They
 *  are spelled ONCE, here, and the pane definition imports them (`lib/automation-pane.tsx`), so a nav row
 *  can never point at an anchor no section stamps. */
export const OWNER_RULES_ANCHOR = "rules";
export const OWNER_BUDGET_ANCHOR = "budget";

/** The owner ceiling's editable range. 0 is a real, useful value — "stop all of my library rules" without
 *  disabling them one by one — and the top is the same 240/hour ceiling a single rule may carry, because a
 *  belt that can be set below the thing it bounds is a belt that reads as broken. */
const OWNER_CAP_MIN = 0;
const OWNER_CAP_MAX = 240;

/** The rate ceiling every owner-global rule counts against. A discrete write behind an explicit Save rather
 *  than an autosave field: this is a BELT, and a half-typed number briefly meaning "3" instead of "30" would
 *  be a belt that silently tightened while the host was still typing it. */
function OwnerBudgetSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: budget } = useSuspenseQuery(trpc.automation.getOwnerBudgets.queryOptions());
  const save = useSetOwnerBudgets({ trpc, invalidation });
  const [value, setValue] = useState<number>(budget.maxFiresPerHour);

  return (
    <Stack id={settingsAnchorId("automation", OWNER_BUDGET_ANCHOR)} gap="block">
      <Text voice="gloss">
        A safety limit across all of your library-wide rules together, so a rule that starts repeating cannot keep spending. Each rule also has its own per-hour
        limit.
      </Text>
      <Row gap="field" align="end">
        {/* NO `aria-label` on the control: an `@orb/ui` NumberField inside a `Field` is a Base UI TEXTBOX
            already NAMED by the Field's own label (and described by its description), so a second name here
            would override the association rather than add to it — the house convention every other numeric
            knob in settings follows. */}
        <Field label="Runs per hour" orientation="vertical" description="Across every library-wide rule you have.">
          <NumberField
            min={OWNER_CAP_MIN}
            max={OWNER_CAP_MAX}
            value={value}
            onValueChange={(next): void => setValue(next === null ? budget.maxFiresPerHour : Math.min(Math.max(next, OWNER_CAP_MIN), OWNER_CAP_MAX))}
          />
        </Field>
        <Button
          intent="secondary"
          size="sm"
          loading={save.isPending}
          disabled={value === budget.maxFiresPerHour}
          onClick={(): void => save.mutate({ maxFiresPerHour: value })}
        >
          Save limit
        </Button>
      </Row>
    </Stack>
  );
}

/** The owner-global rule list + the "Add a rule" picker for the global half of the catalogue. */
function OwnerRulesSection(): ReactElement {
  const trpc = useTRPC();
  const { data: rules } = useSuspenseQuery(trpc.automation.listOwnerRules.queryOptions());

  return (
    <Stack id={settingsAnchorId("automation", OWNER_RULES_ANCHOR)} gap="section">
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

/** The Automation pane's body. Each section carries its OWN `QueryBoundary` so a slow or failed budget read
 *  cannot blank the rule list beside it (and the reverse) — two independent reads, two independent
 *  fallbacks, the settings-surface posture. */
export function OwnerAutomationSurface(): ReactElement {
  return (
    <Stack gap="section">
      <QueryBoundary
        fallback={<SkeletonRows count={3} shape="line" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your library-wide rules" onRetry={retry} />}
      >
        <OwnerRulesSection />
      </QueryBoundary>
      <Separator />
      <QueryBoundary
        fallback={<SkeletonRows count={1} shape="line" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your automation limit" onRetry={retry} />}
      >
        <OwnerBudgetSection />
      </QueryBoundary>
    </Stack>
  );
}
