// ONE automation rule as a row — the surface BOTH rule lists render (the chat's "This chat → Rules" section
// and the owner-global Automation settings pane). One component, because re-deciding what a row IS per
// surface is how two lists of the same thing start disagreeing about what an affordance costs.
//
// THE ROW IS THE SURFACE:
//   · the name speaks at `promoted` and the row's own gloss is the rule's DESCRIPTION — the catalogue's
//     plain-English sentence, which `createRuleFromPreset` stores on every minted rule;
//   · `lastFiredAt` is the state line ("Last ran 5m ago");
//   · ONE primary action stays in the cluster (Test, the free dry run). Run-now and Delete are DEMOTED into
//     the row's own `RowActionsMenu`, where Run-now names its spend (driven by the contract's
//     `SPEND_ARM_TYPES`) and Delete rides the composite's ConfirmDialog. Three affordances at three weights,
//     and the irreversible one is never a single click from the one that spends.
//
// COLLAPSE-UNTIL-NEEDED (an owner ruling). Every affordance at once costs a scan-list far more height than its
// reserve. The row wears the SAME clothes as the Field-overrides section and the injection rows: a
// `Collapsible` in a `!p-0` Card whose trigger carries the whole of what a rule IS at a glance — name, what it
// does, when it last ran, plus the unreadable verdict when there is one — with the enable switch beside it
// and everything else behind the disclosure. Each affordance keeps its weight one press further in. ONE
// affordance stays on the closed face: the enable switch. On/off is the question a host scanning a rule list
// is actually asking, and it is neither destructive nor spending.
//
// THE SECOND SWITCH is the per-rule opt-out, "Offer to run it when rate-capped". It is conditional on the rule
// carrying a SPEND arm — the same condition the server ANDs the stored knob with — and it sits in its OWN
// labelled row because the trailing cluster is already tight at this pane's context width.
//
// SCOPE rides as `chatId: ChatId | null` and reaches only the MUTATIONS, where it addresses which cached
// rule list a settle repaints (`lib/rule-mutations.ts`). Nothing a host SEES differs between the two
// surfaces, which is the point: a rule is a rule, and where it watches is what the enclosing list already
// says.
//
// THE UNREADABLE RULE — `actionsCorrupt`, whose stored actions cannot be READ. It projects `actions: []` like a
// rule nobody has added an arm to, so it needs its own reader: it is an ERROR, and it gets error anatomy — a
// `danger` badge carrying the verdict as a WORD, its own sentence with the engine's `lastError` when there is
// one, and NO enable door. The switch is `readOnly` rather than removed: the primitive's own "you cannot touch
// this" arm keeps the rule's REAL on/off value visible (an unreadable rule left switched on is exactly the
// thing a host needs to see) and paints the Lock glyph as the non-colour signal. Its accessible name states
// the refusal, so a screen-reader user meets the reason at the control rather than only above it.
//
// RUN-NOW IS REFUSED ON THE SAME STATE. Dispatch re-parses the blob, fails, and auto-disables the rule
// (`engine/dispatch.ts::runRule`), so a live Run-now would turn the rule off behind the host's back. It is
// refused in the enable control's own grammar, with the reason as the item's visible detail line. The badge
// sentence already says the rule can't run and names the one repair, which is what both doors say.
//
// A `transform_draft` RULE GETS THE SAME REFUSAL, which is why the two share one resolver (`runNowRefusal`)
// rather than two ternaries in the render. It never dispatches — it registers a `PromptTransform` into chat's
// turn pipeline — so a manual run reaches no terminal and `verbs/run-rule-now.ts` throws
// `transform_not_runnable`. Unlike the unreadable rule it keeps every other affordance: a draft rewriter is a
// healthy rule that simply has no out-of-turn meaning, so its enable switch, Test and Delete all stay live.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Coins, Play } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { DescribedMenuItem, QueryBoundary, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useMobileViewport } from "#state";
import {
  armLabel,
  hasSpendArm,
  ruleBindingTasks,
  ruleGloss,
  runOutcomeNotice,
  SUGGEST_ON_REFUSAL_HELP,
  SUGGEST_ON_REFUSAL_LABEL,
  suggestOnRefusalAccessibleName,
} from "../lib/rule-copy.ts";
import { useDeleteRule, useRunRuleNow, useSetRuleEnabled, useSetRuleSuggestOnRefusal, useTestRule } from "../lib/rule-mutations.ts";
import { isTransformOnlyRule, ruleTransformOnlyRunRefusal, ruleUnreadableEnableRefusal, ruleUnreadableRunRefusal } from "../lib/rule-refusal-copy.ts";
import { ruleToolArgumentGuidance } from "../lib/rule-tool-arguments.ts";
import { RuleConnections } from "./rule-connections.tsx";
import { RuleFireLog } from "./rule-fire-log.tsx";
import { RuleRowState } from "./rule-row-state.tsx";

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
  readonly rule: Rule;
  readonly result: TestRunResult;
}

/** The dry-run verdict: whether the predicate WOULD match on a synthetic event, and each arm's rendered
 *  preview or render error — the "does my template work" answer, executing nothing.
 *
 *  `role="status"`: the verdict appears asynchronously in response to a button press, so without a live
 *  region a screen-reader user pressing Test hears nothing at all. And the badge carries the verdict as a WORD,
 *  never intent colour alone. */
function TestResultView({ rule, result }: TestResultViewProps): ReactElement {
  const trpc = useTRPC();
  const tools = useQuery(trpc.automation.listRuleTools.queryOptions(undefined, { enabled: rule.actions.some((action) => action.type === "run_tool") }));
  const verdict = predicateVerdict(result.predicate);
  return (
    <Stack aria-label={`Test result for ${rule.name}`} gap="tight" role="status">
      <Row gap="block" align="center">
        <Badge intent={verdict.intent} tone="soft" size="sm">
          {verdict.label}
        </Badge>
        <Text voice="gloss">{verdict.line}</Text>
      </Row>
      {result.arms.map((arm, index) => {
        const line = armPreviewLine(arm);
        const action = rule.actions[index];
        const guidance =
          action?.type === "run_tool" && arm.error === undefined && arm.renderedPreview !== undefined
            ? ruleToolArgumentGuidance(
                arm.renderedPreview,
                tools.data?.find((tool) => tool.name === action.name),
                true,
              )
            : null;
        return (
          <Stack key={line} gap="tight">
            <Text voice="gloss">{line}</Text>
            {guidance === null ? null : (
              <Text voice="gloss">{guidance} This is a preview; future event arguments can differ. No tool was invoked or result captured.</Text>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

export interface RuleRowProps {
  /** The rule's SCOPE — its chat, or `null` for an owner-global rule. Reaches the mutations only. */
  readonly chatId: ChatId | null;
  readonly rule: Rule;
  readonly onEdit?: (trigger: HTMLButtonElement) => void;
}

/** WHY "Run now" cannot succeed on this rule, or `null` when it can — the row's ONE place to ask, so the
 *  door and its reason can never disagree, and a third refusal lands as one arm rather than a third
 *  ternary in the render (the same reason `predicateVerdict` above is a function).
 *
 *  Both arms are the server's own refusals, in the host's words: an unreadable blob re-parses and
 *  auto-disables (`engine/dispatch.ts::runRule`), and a draft-rewriting rule never dispatches at all, so
 *  `verbs/run-rule-now.ts` throws `transform_not_runnable`. ORDER MATTERS: an unreadable rule projects
 *  `actions: []`, so the corrupt arm is asked FIRST and the transform predicate's own non-empty guard is
 *  the belt behind it. */
function runNowRefusal(rule: Rule): string | null {
  if (rule.actionsCorrupt) {
    return ruleUnreadableRunRefusal(rule.name);
  }
  if (isTransformOnlyRule(rule.actions)) {
    return ruleTransformOnlyRunRefusal(rule.name);
  }
  return null;
}

/** One rule: its name + what it does + when it last ran, the enable toggle, the free Test action, and the
 *  overflow menu carrying the two actions that are not free (Run now — it spends) and not reversible
 *  (Delete — behind the composite's confirm). Then the last dry-run verdict and the collapsible fire log. */
export function RuleRow({ chatId, rule, onEdit }: RuleRowProps): ReactElement {
  const closedGloss = useMobileViewport() ? "line-clamp-2" : "block truncate";
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetRuleEnabled({ trpc, invalidation });
  const testRule = useTestRule({ trpc, invalidation });
  const runNow = useRunRuleNow({ trpc, invalidation });
  const deleteRule = useDeleteRule({ trpc, invalidation });
  const setSuggestOnRefusal = useSetRuleSuggestOnRefusal({ trpc, invalidation });
  const [testResult, setTestResult] = useState<{ readonly result: TestRunResult; readonly rule: Rule } | null>(null);
  // CLOSED ON ARRIVAL, for every state. Unlike an injection row (a blank one opens itself, because the host
  // just pressed Add and the editor is what they came for), a rule arrives already configured — even the
  // unreadable one, whose whole verdict is on the closed face. The section's reserved box is sized to this.
  const [open, setOpen] = useState(false);
  const enableAdmission = useRef(false);
  const spends = hasSpendArm(rule.actions);
  // `actions` is `[]` for BOTH an unreadable blob and a rule with no arms yet; only this flag separates them.
  const unreadable = rule.actionsCorrupt;
  const runRefusal = runNowRefusal(rule);
  const bindingTasks = unreadable ? [] : ruleBindingTasks(rule.actions);

  const onEnabledChange = (next: boolean): void => {
    if (enableAdmission.current) {
      return;
    }
    enableAdmission.current = true;
    setEnabled.mutate(
      { ruleId: rule.id, enabled: next, chatId },
      {
        onSettled: (): void => {
          enableAdmission.current = false;
        },
      },
    );
  };

  const onTest = (): void => {
    // A FAILED RETEST CLEARS THE VERDICT — it does not leave the last one standing. A kept verdict beside a
    // dry run that errored (or was refused) would say the rule was tested and passed when the test produced
    // no answer at all. `null` is the honest state here — the same one the row starts in — and the
    // mutation's own error surface owns the reason. Clearing FIRST also removes the window where a slow
    // retest shows the old verdict as if it were the new one.
    setTestResult(null);
    testRule.mutateAsync({ ruleId: rule.id, chatId }).then(
      (result) => setTestResult({ result, rule }),
      (): void => setTestResult(null),
    );
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
    // `!p-0` so the block padding lives on the trigger and the whole closed row is one tap target — the
    // Field-overrides card's own reasoning, and the `!` is required there for the same reason (the tier
    // padding map is UNLAYERED, so a plain `p-0` utility loses to it inside a Surface).
    <Card className="!p-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* THE ENABLE SWITCH IS A SIBLING OF THE TRIGGER, NEVER INSIDE IT. A control nested in a `button` is
            unreachable by keyboard and invalid content — so the header is a Row: the disclosure takes the
            slack (`min-w-0 flex-1`, so a long name wraps instead of pushing the switch off the 384px pane)
            and the one control a host needs WITHOUT opening the row sits beside it. `pr-block` supplies the
            padding the trigger's own `p-block` does not reach. */}
        <Row align="center" className="pr-block" gap="field">
          {/* `size="control"` pins the pointer-conditional `--spacing-control-sm` floor (44px coarse / 32px
              fine) — the same arm the fire-log disclosure and the Field-overrides triggers take. `text-start`
              because a `button`'s UA `text-align: center` would centre a multi-line summary; the single-line
              triggers of the sibling sections never showed it. The accessible name COMPUTES from the
              trigger's own content, so it can never disagree with the visible summary (WCAG 2.5.3). */}
          <CollapsibleTrigger className="min-w-0 flex-1 p-block text-start" size="control">
            {/* THE CLOSED FACE — the whole of what a rule IS at a glance: its name, what it does, and when it
                last ran. It is the row's own name/gloss/state trio, standing ALONE while the actions wait
                behind the disclosure. */}
            <Stack className="min-w-0 flex-1" gap="tight">
              <Text voice="promoted">{rule.name}</Text>
              {/* `prose`: the rule's own sentence is the same size as the connection description inside this card.
                  Shut, it keeps to one line (two on a phone) so a closed row stays dense; open, the whole sentence reads. */}
              <Text className={open ? undefined : closedGloss} prose={true} voice="gloss">
                {ruleGloss(rule)}
              </Text>
              {/* The error states stay on the CLOSED face: a rule that cannot or will not run is what a host
                  must meet without opening anything. */}
              <RuleRowState rule={rule} />
            </Stack>
          </CollapsibleTrigger>
          {/* `readOnly`, never `disabled`: the value stays legible (a broken rule left ON is the state a host
              most needs to see), the Lock glyph carries the refusal without colour, and the accessible name
              says WHY instead of offering an action the surface will not perform. The ONE affordance
              that stays on the closed face — on/off is the question a host scanning a rule list is asking,
              and it is neither destructive nor spending. */}
          <Switch
            aria-label={unreadable ? ruleUnreadableEnableRefusal(rule.name) : `Enable ${rule.name}`}
            checked={rule.enabled}
            className="shrink-0"
            disabled={setEnabled.isPending}
            onCheckedChange={onEnabledChange}
            readOnly={unreadable}
          />
        </Row>
        {/* `text-foreground`, the `chat-context-disclosure-section.tsx:51` arm: the panel primitive paints
            `text-muted-foreground` for running prose, and both `Button` intents this row uses are
            `text-current`. Without it Test and the ghost overflow trigger BOTH resolve to the receded ink and
            compute the identical colour, which erases the three-weights reading of the row. */}
        <CollapsiblePanel className="text-foreground">
          <Stack className="px-block pb-block" gap="field">
            <Row align="center" gap="field">
              {/* Test stays visually distinct from editing and the spending actions in the overflow menu. */}
              {onEdit === undefined ? null : (
                <Button intent="ghost" size="sm" aria-label={`Edit ${rule.name}`} onClick={(event): void => onEdit(event.currentTarget)}>
                  Edit
                </Button>
              )}
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
                {/* THE DOORS AGREE: a rule the enable control refuses is refused here too, with the reason as
                    visible detail copy, which reaches a touch user and the item's accessible description alike.
                    A TRANSIENT pending disable carries NO reason (there is nothing to explain and it is gone in
                    a moment); only the persistent gate states explain themselves. */}
                <DescribedMenuItem
                  detail={runRefusal ?? undefined}
                  disabled={runRefusal !== null || runNow.isPending}
                  icon={spends ? Coins : Play}
                  label={spends ? "Run now — spends a model call" : "Run now"}
                  onClick={onRunNow}
                />
              </RowActionsMenu>
            </Row>

            {/* B4 — RULED F4's per-rule opt-out. Rendered ONLY on a rule that carries a SPEND arm, because only
                those can raise a rate-refusal invitation at all (the server ANDs this knob with the same arm-shape
                derivation — `substrate/suggestions.ts::invitesOnRefusal`): offering every rule a switch that
                provably changes nothing on most of them would be a lie the width tax is paid for. Its own row
                rather than a control beside the enable switch, and unlike that switch it carries VISIBLE label
                text, so it needs the room a label deserves. */}
            {spends ? (
              <Stack gap="tight">
                <Row gap="field" align="center" justify="between">
                  <Text as="span" voice="label">
                    {SUGGEST_ON_REFUSAL_LABEL}
                  </Text>
                  <Switch
                    aria-label={suggestOnRefusalAccessibleName(rule.name)}
                    checked={rule.suggestOnRefusal}
                    disabled={setSuggestOnRefusal.isPending}
                    onCheckedChange={(next: boolean): void => {
                      setSuggestOnRefusal.mutate({ ruleId: rule.id, suggestOnRefusal: next, chatId });
                    }}
                  />
                </Row>
                <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
                  {SUGGEST_ON_REFUSAL_HELP}
                </Text>
              </Stack>
            ) : null}

            {testResult === null ? null : <TestResultView rule={testResult.rule} result={testResult.result} />}

            {/* Its own disclosure, so the two reads behind it run only when a host opens it; absent on a rule whose
                arms spend nothing through a binding, and on an unreadable rule (its arms are unknown). */}
            {bindingTasks.length === 0 ? null : (
              <Collapsible>
                <CollapsibleTrigger aria-label={`Connections for ${rule.name}`} size="control">
                  <Text voice="label">Connections</Text>
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <RuleConnections ruleId={rule.id} ruleName={rule.name} tasks={bindingTasks} />
                </CollapsiblePanel>
              </Collapsible>
            )}

            <Collapsible>
              {/* The NAME disambiguates, the LABEL does not repeat it (WCAG 2.5.3 is satisfied by containment —
                  the accessible name contains the visible one): without the name, N rules give N disclosures all
                  announced as a bare "Recent activity", and spelling the rule's name a second time in
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
                  reserveKey="automation.rule.activity"
                >
                  <RuleFireLog ruleId={rule.id} caps={{ cooldownSeconds: rule.cooldownSeconds, maxFiresPerHour: rule.maxFiresPerHour }} />
                </QueryBoundary>
              </CollapsiblePanel>
            </Collapsible>
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  );
}
