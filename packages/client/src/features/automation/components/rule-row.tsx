// ONE automation rule as a row — the surface BOTH rule lists render (the chat's "This chat → Rules" section
// and the owner-global Automation settings pane). Extracted from `rules-section.tsx` at C5 rather than
// copied, because everything a row IS was decided once by side-eye #621 and re-deciding it per surface is
// how two lists of the same thing start disagreeing about what an affordance costs.
//
// THE ROW IS THE SURFACE (side-eye #621, the single highest-value fix). It used to be a `label`-voice name
// over `turnCompleted · 1 action` — the raw wire discriminator plus an arm COUNT — with three ghost buttons
// beside it that computed the IDENTICAL colour: Test (free), Run now (SPENDS a model call or an image) and
// Delete (irreversible, and it fired straight off the click). Two rules minted from one catalogue entry were
// byte-identical rows. Now:
//   · the name speaks at `promoted` and the row's own gloss is the rule's DESCRIPTION — the catalogue's
//     plain-English sentence, which `createRuleFromPreset` already stores on every minted rule;
//   · `lastFiredAt` — on the view since B2 and rendered nowhere — is the state line ("Last ran 5m ago");
//   · ONE primary action stays in the cluster (Test, the free dry run). Run-now and Delete are DEMOTED into
//     the row's own `RowActionsMenu`, where Run-now names its spend (driven by the contract's
//     `SPEND_ARM_TYPES`, whose first client consumer this is) and Delete rides the composite's
//     ConfirmDialog. Three affordances at three weights, and the irreversible one can no longer be reached
//     by a single click 12px from the one that spends.
//
// SCOPE rides as `chatId: ChatId | null` and reaches only the MUTATIONS, where it addresses which cached
// rule list a settle repaints (`lib/rule-mutations.ts`). Nothing a host SEES differs between the two
// surfaces, which is the point: a rule is a rule, and where it watches is what the enclosing list already
// says.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Coins, Icon, Play } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { armLabel, hasSpendArm, lastRunLine, ruleGloss, runOutcomeNotice } from "../lib/rule-copy.ts";
import { useDeleteRule, useRunRuleNow, useSetRuleEnabled, useTestRule } from "../lib/rule-mutations.ts";
import { RuleFireLog } from "./rule-fire-log.tsx";

/** One row of the rule list — tRPC-inferred so a wire reshape breaks here at compile time. */
type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];
type TestRunResult = inferOutput<Trpc["automation"]["testRule"]>;

/** The predicate verdict as line + badge tone — `boolean` is the would/would-not-match answer, an object is
 *  a CEL parse/eval error the dry run surfaced. Split out to keep the render free of nested ternaries. */
function predicateVerdict(predicate: TestRunResult["predicate"]): {
  readonly line: string;
  readonly label: string;
  readonly intent: "success" | "neutral" | "danger";
} {
  if (typeof predicate !== "boolean") {
    return { line: `Condition errored: ${predicate.error}`, label: "Errored", intent: "danger" };
  }
  return predicate
    ? { line: "Condition would match.", label: "Would match", intent: "success" }
    : { line: "Condition would NOT match.", label: "Would not match", intent: "neutral" };
}

/** One arm's dry-run preview line — the rendered template, or its render error, named by what the arm DOES
 *  rather than by its wire discriminator. */
function armPreviewLine(arm: TestRunResult["arms"][number]): string {
  const what = armLabel(arm.type);
  return arm.error === undefined ? `Would ${what}: ${arm.renderedPreview ?? "(no preview)"}` : `Couldn't ${what}: ${arm.error}`;
}

interface TestResultViewProps {
  readonly name: string;
  readonly result: TestRunResult;
}

/** The dry-run verdict: whether the predicate WOULD match on a synthetic event, and each arm's rendered
 *  preview or render error — the "does my template work" answer, executing nothing.
 *
 *  `role="status"` (side-eye #621 ARIA): the verdict appears asynchronously in response to a button press,
 *  so a screen-reader user pressing Test heard NOTHING at all. And the badge carries the verdict as a WORD,
 *  never intent colour alone. */
function TestResultView({ name, result }: TestResultViewProps): ReactElement {
  const verdict = predicateVerdict(result.predicate);
  return (
    <Stack aria-label={`Test result for ${name}`} gap="tight" role="status">
      <Row gap="block" align="center">
        <Badge intent={verdict.intent} tone="soft" size="sm">
          {verdict.label}
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

export interface RuleRowProps {
  /** The rule's SCOPE — its chat, or `null` for an owner-global rule. Reaches the mutations only. */
  readonly chatId: ChatId | null;
  readonly rule: Rule;
}

/** One rule: its name + what it does + when it last ran, the enable toggle, the free Test action, and the
 *  overflow menu carrying the two actions that are not free (Run now — it spends) and not reversible
 *  (Delete — behind the composite's confirm). Then the last dry-run verdict and the collapsible fire log. */
export function RuleRow({ chatId, rule }: RuleRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetRuleEnabled({ trpc, invalidation });
  const testRule = useTestRule({ trpc, invalidation });
  const runNow = useRunRuleNow({ trpc, invalidation });
  const deleteRule = useDeleteRule({ trpc, invalidation });
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  const spends = hasSpendArm(rule.actions);

  const onTest = (): void => {
    testRule.mutateAsync({ ruleId: rule.id, chatId }).then(setTestResult, () => undefined);
  };
  const onRunNow = (): void => {
    runNow.mutateAsync({ ruleId: rule.id, chatId }).then(
      (result) => {
        const notice = runOutcomeNotice(rule.name, result.outcome);
        notify[notice.channel](notice.line);
      },
      () => undefined,
    );
  };

  return (
    <Stack gap="block">
      <Row gap="block" align="start" justify="between">
        {/* The NAME COLUMN takes the row's slack (`min-w-0` so a long sentence wraps instead of pushing the
            cluster off the pane at the 384px context width). */}
        <Stack className="min-w-0 flex-1" gap="tight">
          <Text voice="promoted">{rule.name}</Text>
          <Text voice="gloss">{ruleGloss(rule)}</Text>
          <Text voice="gloss">
            {lastRunLine(rule.lastFiredAt)}
            {rule.lastError === null ? "" : " Its last run errored."}
          </Text>
        </Stack>
        <Row className="shrink-0" gap="field" align="center">
          <Switch
            aria-label={`Enable ${rule.name}`}
            checked={rule.enabled}
            onCheckedChange={(next): void => setEnabled.mutate({ ruleId: rule.id, enabled: next, chatId })}
          />
          {/* The ONE in-cluster action, and the only free one: a dry run executes nothing. `secondary` (an
              edge + foreground ink) is what separates it from the ghost overflow trigger beside it. */}
          <Button intent="secondary" size="sm" aria-label={`Test ${rule.name}`} loading={testRule.isPending} onClick={onTest}>
            Test
          </Button>
          <RowActionsMenu
            label={`More actions for ${rule.name}`}
            destructive={{
              title: `Delete "${rule.name}"?`,
              description: "This removes the rule and its activity. It can't be undone, but you can add the rule again.",
              confirmLabel: "Delete rule",
              onConfirm: (): void => deleteRule.mutate({ ruleId: rule.id, chatId }),
            }}
          >
            <MenuItem disabled={runNow.isPending} onClick={onRunNow}>
              <Icon icon={spends ? Coins : Play} size="sm" />
              {spends ? "Run now — spends a model call" : "Run now"}
            </MenuItem>
          </RowActionsMenu>
        </Row>
      </Row>

      {testResult === null ? null : <TestResultView name={rule.name} result={testResult} />}

      <Collapsible>
        {/* The NAME disambiguates, the LABEL does not repeat it (WCAG 2.5.3 is satisfied by containment —
            the accessible name contains the visible one): N rules used to give N disclosures all announced
            as a bare "Recent activity" (side-eye #621 ARIA), and spelling the rule's name a second time in
            the visible row is noise a sighted host already has above it. */}
        {/* `size="control"` — the disclosure IS a row of its own, and it is the ONLY door to the fire log,
            the "why didn't my rule fire" surface. It shipped `inline` (text-height): measured 413×16 at a
            coarse pointer with `::after` resolving `content: none`, so no touch layer was in play at all,
            against the 44px floor — and the 6px bands above and below it belong to the Stack, not to the
            trigger, so a finger landing 8px off hits nothing. The `control` arm pins the pointer-conditional
            `--spacing-control-sm` floor (44px coarse / 32px fine) that every other tap-floor control in this
            pane rides. */}
        <CollapsibleTrigger aria-label={`Recent activity for ${rule.name}`} size="control">
          <Text voice="label">Recent activity</Text>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <QueryBoundary
            fallback={<SkeletonRows count={2} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the recent activity" onRetry={retry} />}
          >
            <RuleFireLog ruleId={rule.id} caps={{ cooldownSeconds: rule.cooldownSeconds, maxFiresPerHour: rule.maxFiresPerHour }} />
          </QueryBoundary>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}
