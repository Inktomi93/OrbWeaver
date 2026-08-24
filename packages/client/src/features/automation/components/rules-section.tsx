// B2 — the "This chat" Rules SECTION (interaction-direction-spec §7 B2). The host-only surface that drives
// the automation rule lifecycle: the rule list with an enable/disable toggle, per-rule Test (dry-run) and
// Run-now (R7 fresh dispatch), the "Add a rule" preset picker, and each rule's recent FIRE LOG (the
// "why didn't my rule fire" surface). It is a foreign feature grafting into chat's "This chat" tab — it
// imports NO chat module and chat imports none of it (client-features-no-cross); the tab's host-controls
// band renders it blind through the §6c SECTION seam (`lib/rules-settings-section.tsx`, #616).
//
// HOST-ONLY BY CONSTRUCTION: every `automation.*` rule verb is host-gated server-side, and this section is
// mounted only inside the tab's host-controls band. A member never reaches `listRules` (it collapses to a
// leak-free NOT_FOUND) and never sees this section.
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
// LIVE FRESHNESS: rule CRUD/enable/Test/Run-now reconcile through each mutation's own `invalidates`. But a
// rule also fires from a REAL turn with no local mutation — so this section additionally subscribes to the
// chat's `automation` room and invalidates the rules list + the affected fire log off `ruleFired`/
// `ruleErrored`/`ruleAutoDisabled`/`rulesChanged` (the members `apply-automation-bus-event.ts` names as
// "B2's rules panel's" — the reducer folds only the pending-ask members). The room is a SECOND subscriber
// on the same multiplexed socket as the S4 card mount; the registry fans one room to a Set of subscribers.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Coins, Icon, Play } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Separator } from "@orb/ui/separator";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useBusRoom, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { armLabel, hasSpendArm, lastRunLine, ruleGloss, runOutcomeNotice } from "../lib/rule-copy.ts";
import { useDeleteRule, useRunRuleNow, useSetRuleEnabled, useTestRule } from "../lib/rule-mutations.ts";
import { RuleFireLog } from "./rule-fire-log.tsx";
import { RulePresetPicker } from "./rule-preset-picker.tsx";

type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];
type TestRunResult = inferOutput<Trpc["automation"]["testRule"]>;

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

/** One rule: its name + what it does + when it last ran, the enable toggle, the free Test action, and the
 *  overflow menu carrying the two actions that are not free (Run now — it spends) and not reversible
 *  (Delete — behind the composite's confirm). Then the last dry-run verdict and the collapsible fire log. */
function RuleRow({ chatId, rule }: RuleRowProps): ReactElement {
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
              description: "This removes the rule and its activity from this chat. It can't be undone, but you can add the rule again.",
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
            pane rides; the Field-override triggers one section up are the 40px positive control (#655). */}
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

interface TestResultViewProps {
  readonly name: string;
  readonly result: TestRunResult;
}

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

export interface RulesSectionProps {
  readonly chatId: ChatId;
}

/** The Rules section body: the live rule list + the "Add a rule" picker. Suspends on `listRules` — wrap in
 *  the tab's own `QueryBoundary`. Host-only by construction (the whole section mounts only for a host). */
export function RulesSection({ chatId }: RulesSectionProps): ReactElement {
  const trpc = useTRPC();
  const { data: rules } = useSuspenseQuery(trpc.automation.listRules.queryOptions({ chatId }));
  useRuleFeedInvalidation(chatId);

  return (
    <Stack gap="section">
      {/* THE TEACHING COPY LIVES IN THE EMPTY STATE and retires once the surface can speak for itself
          (side-eye #621 P2-5) — a permanent three-line paragraph over a list that already says what each
          rule does is spent attention. The one-line gloss stays in both arms, because every sibling
          section in this pane opens with one. */}
      <Text voice="gloss">Rules watch this chat and act on their own.</Text>
      {rules.length === 0 ? (
        <Text voice="gloss">
          Nothing is watching this chat yet. Add a rule — post an image, nudge the pacing, offer chips — and it starts off until you enable it.
        </Text>
      ) : (
        <Stack gap="section">
          {rules.map((rule: Rule, index: number) => (
            <Stack key={rule.id} gap="section">
              {/* ONE hairline between rules (side-eye #621 P2-7): with two rules and no separation, each
                  "Recent activity" disclosure sat equidistant between its own title and the NEXT rule's. */}
              {index === 0 ? null : <Separator />}
              <RuleRow chatId={chatId} rule={rule} />
            </Stack>
          ))}
        </Stack>
      )}
      <RulePresetPicker chatId={chatId} />
    </Stack>
  );
}
