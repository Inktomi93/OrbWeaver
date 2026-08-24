// B2 — the "This chat" Rules SECTION (interaction-direction-spec §7 B2). The host-only surface that drives
// the automation rule lifecycle: the rule list with an enable/disable toggle, per-rule Test (dry-run) and
// Run-now (R7 fresh dispatch), the "Add rule…" preset picker, and each rule's recent FIRE LOG (the
// "why didn't my rule fire" surface). It is a foreign feature grafting onto chat's "This chat" tab — it
// imports NO chat module and chat imports none of it (client-features-no-cross); the tab renders it blind.
//
// HOST-ONLY BY CONSTRUCTION: every `automation.*` rule verb is host-gated server-side, and this section is
// mounted only inside the tab's host-controls band. A member never reaches `listRules` (it collapses to a
// leak-free NOT_FOUND) and never sees this section.
//
// LIVE FRESHNESS: rule CRUD/enable/Test/Run-now reconcile through each mutation's own `invalidates`. But a
// rule also fires from a REAL turn with no local mutation — so this section additionally subscribes to the
// chat's `automation` room and invalidates the rules list + the affected fire log off `ruleFired`/
// `ruleErrored`/`ruleAutoDisabled`/`rulesChanged` (the members `apply-automation-bus-event.ts` names as
// "B2's rules panel's" — the reducer folds only the pending-ask members). The room is a SECOND subscriber
// on the same multiplexed socket as the S4 card mount; the registry fans one room to a Set of subscribers.

import type { AutomationRunOutcome } from "@orb/contracts/automation";
import type { StreamRoomRef } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useBusRoom, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useDeleteRule, useRunRuleNow, useSetRuleEnabled, useTestRule } from "../lib/rule-mutations.ts";
import { RuleFireLog } from "./rule-fire-log.tsx";
import { RulePresetPicker } from "./rule-preset-picker.tsx";

type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];
type TestRunResult = inferOutput<Trpc["automation"]["testRule"]>;

/** A run-now outcome as a host-facing line. A string-union switch (biome narrows these cleanly), covering
 *  the fire terminals plus `suggested` (a confirm-first rule stashed a card instead of acting). */
function runOutcomeLine(name: string, outcome: AutomationRunOutcome): string {
  switch (outcome) {
    case "fired":
      return `Ran "${name}" — it fired.`;
    case "suggested":
      return `Ran "${name}" — it raised a suggestion card.`;
    case "predicate_false":
      return `Ran "${name}" — its condition did not hold, so nothing happened.`;
    case "predicate_error":
      return `Ran "${name}" — its condition errored.`;
    case "budget_refused":
      return `Ran "${name}" — the fire-rate cap turned it away.`;
    case "depth_refused":
      return `Ran "${name}" — the cascade-depth cap turned it away.`;
    case "action_error":
      return `Ran "${name}" — an action errored (see the fire log).`;
    case "authority_refused":
      return `Ran "${name}" — you no longer hold the authority it needs.`;
    case "test_run":
      return `Ran "${name}".`;
    default: {
      const exhaustive: never = outcome;
      throw new Error(`unhandled automation run outcome: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Subscribe to the chat's `automation` room and invalidate the rules list + affected fire log when a rule
 *  fires, errors, auto-disables, or the set changes from a REAL turn (no local mutation moved them). */
function useRuleFeedInvalidation(chatId: ChatId): void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const ref: Extract<StreamRoomRef, { channel: "automation" }> = { channel: "automation", chatId };
  useBusRoom<"automation">(ref, {
    onEvent: (frame) => {
      const event = frame.event;
      if (event.type === "quickReplySurfaced" || event.type === "suggestionRaised") {
        return; // the S4 card mount's members; they move no rule state.
      }
      invalidation.invalidateFilters([trpc.automation.listRules.queryFilter({ chatId: event.chatId })]);
      if (event.type === "ruleFired" || event.type === "ruleErrored") {
        invalidation.invalidateFilters([trpc.automation.listFires.queryFilter({ ruleId: event.ruleId })]);
      }
    },
  });
}

interface RuleRowProps {
  readonly chatId: ChatId;
  readonly rule: Rule;
}

/** One rule: name + trigger gloss, the enable toggle, Test / Run-now / Delete, the last dry-run verdict, and
 *  a collapsible recent fire log. */
function RuleRow({ chatId, rule }: RuleRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetRuleEnabled({ trpc, invalidation });
  const testRule = useTestRule({ trpc, invalidation });
  const runNow = useRunRuleNow({ trpc, invalidation });
  const deleteRule = useDeleteRule({ trpc, invalidation });
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);

  const onTest = (): void => {
    testRule.mutateAsync({ ruleId: rule.id, chatId }).then(setTestResult, () => undefined);
  };
  const onRunNow = (): void => {
    runNow.mutateAsync({ ruleId: rule.id, chatId }).then(
      (result) => notify.success(runOutcomeLine(rule.name, result.outcome)),
      () => undefined,
    );
  };

  return (
    <Stack gap="block">
      <Row gap="block" align="center" justify="between">
        <Stack gap="tight">
          <Text voice="label">{rule.name}</Text>
          <Text voice="gloss">
            {rule.trigger.type} · {rule.actions.length === 1 ? "1 action" : `${rule.actions.length} actions`}
            {rule.lastError === null ? "" : " · last run errored"}
          </Text>
        </Stack>
        <Row gap="block" align="center">
          <Switch
            aria-label={`Enable ${rule.name}`}
            checked={rule.enabled}
            onCheckedChange={(next): void => setEnabled.mutate({ ruleId: rule.id, enabled: next, chatId })}
          />
          <Button intent="ghost" size="sm" loading={testRule.isPending} onClick={onTest}>
            Test
          </Button>
          <Button intent="ghost" size="sm" loading={runNow.isPending} onClick={onRunNow}>
            Run now
          </Button>
          <Button intent="ghost" size="sm" aria-label={`Delete ${rule.name}`} onClick={(): void => deleteRule.mutate({ ruleId: rule.id, chatId })}>
            Delete
          </Button>
        </Row>
      </Row>

      {testResult === null ? null : <TestResultView result={testResult} />}

      <Collapsible>
        <CollapsibleTrigger>
          <Text voice="label">Recent activity</Text>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <QueryBoundary
            fallback={<SkeletonRows count={2} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the fire log" onRetry={retry} />}
          >
            <RuleFireLog ruleId={rule.id} />
          </QueryBoundary>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}

interface TestResultViewProps {
  readonly result: TestRunResult;
}

/** The predicate verdict as line + badge tone — `boolean` is the would/would-not-match answer, an object is
 *  a CEL parse/eval error the dry run surfaced. Split out to keep the render free of nested ternaries. */
function predicateVerdict(predicate: TestRunResult["predicate"]): { readonly line: string; readonly intent: "success" | "neutral" | "danger" } {
  if (typeof predicate !== "boolean") {
    return { line: `Condition errored: ${predicate.error}`, intent: "danger" };
  }
  return predicate ? { line: "Condition would match.", intent: "success" } : { line: "Condition would NOT match.", intent: "neutral" };
}

/** One arm's dry-run preview line — the rendered template, or its render error. */
function armPreviewLine(arm: TestRunResult["arms"][number]): string {
  return arm.error === undefined ? `${arm.type}: ${arm.renderedPreview ?? "(no preview)"}` : `${arm.type}: error — ${arm.error}`;
}

/** The dry-run verdict: whether the predicate WOULD match on a synthetic event, and each arm's rendered
 *  preview or render error — the "does my template work" answer, executing nothing. */
function TestResultView({ result }: TestResultViewProps): ReactElement {
  const verdict = predicateVerdict(result.predicate);
  return (
    <Stack gap="tight">
      <Row gap="block" align="center">
        <Badge intent={verdict.intent} tone="soft" size="sm">
          Test
        </Badge>
        <Text voice="gloss">{verdict.line}</Text>
      </Row>
      {result.arms.map((arm) => {
        const line = armPreviewLine(arm);
        return (
          <Text key={line} voice="gloss">
            {line}
          </Text>
        );
      })}
    </Stack>
  );
}

export interface RulesSectionProps {
  readonly chatId: ChatId;
}

/** The Rules section body: the live rule list + the "Add rule…" picker. Suspends on `listRules` — wrap in
 *  the tab's own `QueryBoundary`. Host-only by construction (the whole section mounts only for a host). */
export function RulesSection({ chatId }: RulesSectionProps): ReactElement {
  const trpc = useTRPC();
  const { data: rules } = useSuspenseQuery(trpc.automation.listRules.queryOptions({ chatId }));
  useRuleFeedInvalidation(chatId);

  return (
    <Stack gap="section">
      <Text voice="gloss">
        Rules watch this chat and act on their own — post an image, nudge the pacing, offer chips. Add one from the catalogue; each starts off until you enable
        it.
      </Text>
      {rules.length === 0 ? (
        <Text voice="gloss">No rules yet.</Text>
      ) : (
        <Stack gap="section">
          {rules.map((rule: Rule) => (
            <RuleRow key={rule.id} chatId={chatId} rule={rule} />
          ))}
        </Stack>
      )}
      <RulePresetPicker chatId={chatId} />
    </Stack>
  );
}
