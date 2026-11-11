import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { Badge, STATUS_PILL_VARIANT } from "#primitives/badge";
import { Button } from "#primitives/button";
import { Check, Icon, Minus, Plus, X } from "#primitives/icons";
import type { Tone } from "#tokens";
import { COMPARE_SIDE_TONE, compareBlocksVariants } from "./variants.ts";

interface CompareBlockBase {
  /** Optional field name, shown above the pair — omitted for a single full-text pair. */
  readonly label?: string;
}

export type CompareBlock = CompareBlockBase &
  (
    | {
        /** ABSENT-SIDE ARMS (the R3 widening): at least one side is present.
         *  `before` only = a CLEARED block (the after side renders the "Cleared" state panel); `after` only =
         *  an ADDED block (no fabricated empty left pane — "was blank" would be a lie for an append). */
        readonly before?: string;
        readonly after?: string;
        readonly body?: never;
        /** One line of consequence copy on the absent-side state panel ("this greeting slot will be removed —
         *  later greetings shift up"). */
        readonly stateNote?: string;
      }
    | {
        readonly before?: never;
        readonly after?: never;
        /** Replace the default pair body (the FORK-C inline-diff arm for short texts) — the review verbs and
         *  state chips still wrap it, so a mixed round keeps ONE accept grammar. */
        readonly body?: ReactNode;
        readonly stateNote?: never;
      }
  );

/** The REVIEW variant's tri-state: `null` = undecided (fails closed — never applies), `true` = kept,
 *  `false` = discarded. Belt 10 rendered as UI: every block opens undecided, each decision is an
 *  individual verb press, and there is deliberately NO bulk gesture. */
export type CompareDecision = boolean | null;

export interface CompareReview {
  /** Parallel to `blocks`. */
  readonly decided: readonly CompareDecision[];
  readonly onDecide: (index: number, decision: CompareDecision) => void;
  /** Collapse decided blocks to header + state chip (the coarse-tax relief the owner took) — pressing
   *  the collapsed row re-expands it. @defaultValue true */
  readonly collapseDecided?: boolean;
}

export interface CompareBlocksProps {
  readonly blocks: readonly CompareBlock[];
  /** The ARM-B review grammar (per-block Keep/Discard verbs, tri-state, no bulk row) — the accept
   *  ergonomics the owner ruled. Without it the blocks render as a read-only comparison. */
  readonly review?: CompareReview;
}

const DECISION_WORD: Record<"kept" | "discarded" | "undecided", string> = {
  kept: "Kept",
  discarded: "Discarded",
  undecided: "Undecided",
};

/** The tone each decision's state chip wears, the status pill's own: a discarded rewrite is the safe outcome, so it is neutral. */
const DECISION_TONE: Record<"kept" | "discarded" | "undecided", Tone> = {
  kept: "success",
  discarded: "neutral",
  undecided: "warning",
};

function decisionOf(decision: CompareDecision): "kept" | "discarded" | "undecided" {
  if (decision === true) {
    return "kept";
  }
  return decision === false ? "discarded" : "undecided";
}

/**
 * Renders `blocks` as intent-tinted pairs (before = danger, after = success). Colorblind-safe: each
 * side also carries a glyph plus visually-hidden text, and the review tri-state is carried by WORDS
 * (header chip + verb labels) — the discarded dim/dash is a redundant third channel, and strikethrough
 * is never used for state (it is the diff's own vocabulary). Distinct from `@orb/ui/diff` (token-level
 * jsdiff segments) — this renders two whole strings side-by-side; a block may swap its body for one.
 */
type Slots = ReturnType<typeof compareBlocksVariants>;
type DecisionWord = keyof typeof DECISION_WORD;

function stateChipText(decision: DecisionWord): string {
  return decision === "undecided" ? "Undecided · will not apply" : DECISION_WORD[decision];
}

/** A decided block's collapsed row (header + state chip) — pressing it re-expands. */
function CollapsedRow({ name, decision, slots, onExpand }: { name: string; decision: DecisionWord; slots: Slots; onExpand: () => void }): ReactElement {
  return (
    <button className={slots.collapsedRow()} data-decision={decision} data-slot="compare-block-collapsed" onClick={onExpand} type="button">
      <span className={slots.blockLabel()}>{name}</span>
      <span className={slots.blockSpacer()} />
      <Badge size="compact" tone={DECISION_TONE[decision]} variant={STATUS_PILL_VARIANT[DECISION_TONE[decision]]}>
        {DECISION_WORD[decision]}
      </Badge>
      <span className={slots.srOnly()}>Show the change again</span>
    </button>
  );
}

/** The default pair body. The ADDED arm's state panel takes the BEFORE slot ("was blank" would fabricate
 *  a history) — the added TEXT still paints in the after pane, because a review must show what it is
 *  deciding on. */
function PairBody({ block, cleared, added, slots }: { block: CompareBlock; cleared: boolean; added: boolean; slots: Slots }): ReactElement {
  return (
    <div className={slots.pair()}>
      {added ? (
        <div className={slots.panel({ side: "state" })} data-slot="compare-block-added">
          <span className={slots.sideHeader()}>
            <Icon icon={Plus} size="xs" />
            Added
          </span>
          {block.stateNote !== undefined ? <p className={slots.stateNote()}>{block.stateNote}</p> : null}
        </div>
      ) : (
        <div className={slots.panel({ side: "before" })} data-slot="compare-block-before" data-tone={COMPARE_SIDE_TONE.before}>
          <span className={slots.sideHeader()}>
            <Icon icon={Minus} size="xs" />
            <span className={slots.srOnly()}>Before</span>
          </span>
          <p className={slots.text()}>{block.before}</p>
        </div>
      )}
      {cleared ? (
        <div className={slots.panel({ side: "state" })} data-slot="compare-block-cleared">
          <span className={slots.sideHeader()}>
            <Icon icon={X} size="xs" />
            Cleared
          </span>
          {block.stateNote !== undefined ? <p className={slots.stateNote()}>{block.stateNote}</p> : null}
        </div>
      ) : (
        <div className={slots.panel({ side: "after" })} data-slot="compare-block-after" data-tone={COMPARE_SIDE_TONE.after}>
          <span className={slots.sideHeader()}>
            <Icon icon={Plus} size="xs" />
            <span className={slots.srOnly()}>After</span>
          </span>
          <p className={slots.text()}>{block.after}</p>
        </div>
      )}
    </div>
  );
}

/** The review grammar's verb row: per-block Keep/Discard, tri-state (a second press returns to
 *  undecided), the cleared arm carrying its destructive-consent wording on the verb itself. */
function ReviewVerbs({
  name,
  cleared,
  decision,
  slots,
  onDecide,
}: {
  name: string;
  cleared: boolean;
  decision: DecisionWord;
  slots: Slots;
  onDecide: (decision: CompareDecision) => void;
}): ReactElement {
  return (
    <div className={slots.verbRow()} data-slot="compare-block-verbs">
      <Button
        aria-pressed={decision === "kept"}
        variant={decision === "kept" ? "solid" : "outline"}
        onClick={(): void => onDecide(decision === "kept" ? null : true)}
        size="sm"
      >
        <Icon icon={Check} size="xs" />
        {cleared ? "Keep (empties field)" : "Keep"}
        <span className={slots.srOnly()}> {name}</span>
      </Button>
      <Button aria-pressed={decision === "discarded"} variant="outline" onClick={(): void => onDecide(decision === "discarded" ? null : false)} size="sm">
        <Icon icon={X} size="xs" />
        Discard
        <span className={slots.srOnly()}> {name}</span>
      </Button>
    </div>
  );
}

interface BlockState {
  readonly name: string;
  readonly cleared: boolean;
  readonly added: boolean;
  readonly decision: DecisionWord | null;
  readonly collapsed: boolean;
}

/** One block's derived render state. The absent-side arms classify ONLY the default pair body: a
 *  `body`-override block (e.g. the conflict three-pane, the inline diff) legitimately carries neither
 *  side, and must not inherit the cleared arm's destructive-consent verb copy. */
function blockStateOf(block: CompareBlock, index: number, review: CompareReview | undefined, reExpanded: ReadonlySet<number>): BlockState {
  const cleared = block.body === undefined && block.before !== undefined && block.after === undefined;
  const added = block.body === undefined && block.after !== undefined && block.before === undefined;
  const decision = review === undefined ? null : decisionOf(review.decided[index] ?? null);
  const collapsed = review !== undefined && (review.collapseDecided ?? true) && decision !== null && decision !== "undecided" && !reExpanded.has(index);
  return { name: block.label ?? `change ${index + 1}`, cleared, added, decision, collapsed };
}

export function CompareBlocks({ blocks, review }: CompareBlocksProps): ReactElement {
  const slots = compareBlocksVariants();
  // Which decided blocks the user re-expanded (presentation-only state; the DECISIONS stay controlled).
  const [reExpanded, setReExpanded] = useState<ReadonlySet<number>>(new Set());

  return (
    <div className={slots.root()} data-slot="compare-blocks">
      {blocks.map((block, index) => {
        const state = blockStateOf(block, index, review, reExpanded);
        if (state.decision !== null && state.collapsed) {
          return (
            <CollapsedRow
              decision={state.decision}
              // biome-ignore lint/suspicious/noArrayIndexKey: decisions address positions; the active-field caller disables collapse state while replacing its single slot.
              key={index}
              name={state.name}
              onExpand={(): void => setReExpanded((prev) => new Set([...prev, index]))}
              slots={slots}
            />
          );
        }
        return (
          <BlockView
            block={block}
            // biome-ignore lint/suspicious/noArrayIndexKey: decisions address positions; the active-field caller disables collapse state while replacing its single slot.
            key={index}
            onDecide={
              review === undefined
                ? undefined
                : (next): void => {
                    review.onDecide(index, next);
                    setReExpanded((prev) => new Set([...prev].filter((i) => i !== index)));
                  }
            }
            slots={slots}
            state={state}
          />
        );
      })}
    </div>
  );
}

/** One expanded block: header (label + state chip), the body (pair or override), and its review verbs
 *  when a decision channel exists. */
function BlockView({
  block,
  state,
  slots,
  onDecide,
}: {
  block: CompareBlock;
  state: BlockState;
  slots: Slots;
  onDecide: ((decision: CompareDecision) => void) | undefined;
}): ReactElement {
  const { name, cleared, added, decision } = state;
  return (
    <div className={slots.block({ ...(decision === null ? {} : { decision }) })} data-slot="compare-block">
      <div className={slots.blockHeader()}>
        {block.label !== undefined ? <h3 className={slots.blockLabel()}>{block.label}</h3> : null}
        <span className={slots.blockSpacer()} />
        {decision !== null ? (
          <Badge data-slot="compare-block-state" size="compact" tone={DECISION_TONE[decision]} variant={STATUS_PILL_VARIANT[DECISION_TONE[decision]]}>
            {stateChipText(decision)}
          </Badge>
        ) : null}
      </div>
      <div className={slots.body({ ...(decision === null ? {} : { decision }) })}>
        {block.body ?? <PairBody added={added} block={block} cleared={cleared} slots={slots} />}
      </div>
      {onDecide !== undefined && decision !== null ? <ReviewVerbs cleared={cleared} decision={decision} name={name} onDecide={onDecide} slots={slots} /> : null}
    </div>
  );
}
