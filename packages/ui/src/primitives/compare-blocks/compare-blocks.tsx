import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { cn } from "#lib";
import { Button } from "#primitives/button";
import { Checkbox } from "#primitives/checkbox";
import { Check, Icon, Minus, Plus, X } from "#primitives/icons";
import { compareBlocksVariants } from "./variants.ts";

export interface CompareBlock {
  /** Optional field name, shown above the pair — omitted for a single full-text pair. */
  readonly label?: string;
  /** ABSENT-SIDE ARMS (the R3 widening): at least one side is present.
   *  `before` only = a CLEARED block (the after side renders the "Cleared" state panel); `after` only =
   *  an ADDED block (no fabricated empty left pane — "was blank" would be a lie for an append). */
  readonly before?: string;
  readonly after?: string;
  /** Replace the default pair body (the FORK-C inline-diff arm for short texts) — the review verbs and
   *  state chips still wrap it, so a mixed round keeps ONE accept grammar. */
  readonly body?: ReactNode;
  /** One line of consequence copy on the absent-side state panel ("this greeting slot will be removed —
   *  later greetings shift up"). */
  readonly stateNote?: string;
}

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
  /** LEGACY checkbox acceptance (pre-R3 consumers/CT) — ignored when `review` is supplied. */
  readonly accepted?: readonly boolean[];
  readonly onAcceptedChange?: (accepted: readonly boolean[]) => void;
  /** @defaultValue "Accept all" */
  readonly acceptAllLabel?: string;
  /** The ARM-B review grammar (per-block Keep/Discard verbs, tri-state, no bulk row) — the accept
   *  ergonomics the owner ruled. Supplying it suppresses the checkbox grammar entirely. */
  readonly review?: CompareReview;
  readonly className?: string;
}

const DECISION_WORD: Record<"kept" | "discarded" | "undecided", string> = {
  kept: "Kept",
  discarded: "Discarded",
  undecided: "Undecided",
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
      <span className={slots.stateChip({ decision })}>{DECISION_WORD[decision]}</span>
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
        <div className={slots.panel({ side: "before" })} data-slot="compare-block-before">
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
        <div className={slots.panel({ side: "after" })} data-slot="compare-block-after">
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
        intent={decision === "kept" ? "primary" : "secondary"}
        onClick={(): void => onDecide(decision === "kept" ? null : true)}
        size="sm"
      >
        <Icon icon={Check} size="xs" />
        {cleared ? "Keep (empties field)" : "Keep"}
        <span className={slots.srOnly()}> {name}</span>
      </Button>
      <Button aria-pressed={decision === "discarded"} intent="secondary" onClick={(): void => onDecide(decision === "discarded" ? null : false)} size="sm">
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

/** The LEGACY accept-all checkbox row (pre-R3 grammar). */
function AcceptAllRow({
  count,
  accepted,
  label,
  slots,
  onAcceptedChange,
}: {
  count: number;
  accepted: readonly boolean[];
  label: string;
  slots: Slots;
  onAcceptedChange: (accepted: readonly boolean[]) => void;
}): ReactElement {
  const acceptedCount = accepted.filter(Boolean).length;
  const allAccepted = count > 0 && acceptedCount === count;
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox control is nested inside.
    <label className={slots.acceptAllRow()} data-slot="compare-blocks-accept-all">
      <Checkbox
        checked={allAccepted}
        indeterminate={acceptedCount > 0 && !allAccepted}
        onCheckedChange={(value: boolean): void => onAcceptedChange(Array.from({ length: count }, () => value))}
      />
      <span className={slots.acceptAllLabel()}>{label}</span>
    </label>
  );
}

/** The LEGACY per-block accept checkbox (pre-R3 grammar). The next array is built over the BLOCK count
 *  (a short `accepted` back-fills false), preserving the primitive's original controlled contract. */
function AcceptRow({
  name,
  index,
  count,
  accepted,
  slots,
  onAcceptedChange,
}: {
  name: string;
  index: number;
  count: number;
  accepted: readonly boolean[];
  slots: Slots;
  onAcceptedChange: (accepted: readonly boolean[]) => void;
}): ReactElement {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox control is nested inside.
    <label className={slots.acceptRow()} data-slot="compare-block-accept">
      <Checkbox
        checked={accepted[index] ?? false}
        onCheckedChange={(value: boolean): void => onAcceptedChange(Array.from({ length: count }, (_, i) => (i === index ? value : (accepted[i] ?? false))))}
      />
      <span className={slots.acceptLabel()}>
        Accept<span className={slots.srOnly()}> {name}</span>
      </span>
    </label>
  );
}

export function CompareBlocks({ blocks, accepted, onAcceptedChange, acceptAllLabel = "Accept all", review, className }: CompareBlocksProps): ReactElement {
  const slots = compareBlocksVariants();
  const canAccept = review === undefined && accepted !== undefined && onAcceptedChange !== undefined;
  // Which decided blocks the user re-expanded (presentation-only state; the DECISIONS stay controlled).
  const [reExpanded, setReExpanded] = useState<ReadonlySet<number>>(new Set());

  return (
    <div className={cn(slots.root(), className)} data-slot="compare-blocks">
      {canAccept && blocks.length > 1 ? (
        <AcceptAllRow accepted={accepted} count={blocks.length} label={acceptAllLabel} onAcceptedChange={onAcceptedChange} slots={slots} />
      ) : null}
      {blocks.map((block, index) => {
        const state = blockStateOf(block, index, review, reExpanded);
        if (state.decision !== null && state.collapsed) {
          return (
            <CollapsedRow
              decision={state.decision}
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks is a fixed-order review snapshot for the lifetime of the review — no reorder/insert case.
              key={index}
              name={state.name}
              onExpand={(): void => setReExpanded((prev) => new Set([...prev, index]))}
              slots={slots}
            />
          );
        }
        return (
          <BlockView
            accepted={accepted}
            block={block}
            count={blocks.length}
            index={index}
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks is a fixed-order review snapshot for the lifetime of the review — no reorder/insert case.
            key={index}
            onAcceptedChange={onAcceptedChange}
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

/** One expanded block: header (label + state chip), the body (pair or override), and its grammar row —
 *  review verbs when a decision channel exists, else the legacy accept checkbox when one is wired. */
function BlockView({
  block,
  index,
  count,
  state,
  slots,
  accepted,
  onAcceptedChange,
  onDecide,
}: {
  block: CompareBlock;
  index: number;
  count: number;
  state: BlockState;
  slots: Slots;
  accepted: readonly boolean[] | undefined;
  onAcceptedChange: ((accepted: readonly boolean[]) => void) | undefined;
  onDecide: ((decision: CompareDecision) => void) | undefined;
}): ReactElement {
  const { name, cleared, added, decision } = state;
  return (
    <div className={slots.block({ ...(decision === null ? {} : { decision }) })} data-slot="compare-block">
      <div className={slots.blockHeader()}>
        {block.label !== undefined ? <h3 className={slots.blockLabel()}>{block.label}</h3> : null}
        <span className={slots.blockSpacer()} />
        {decision !== null ? (
          <span className={slots.stateChip({ decision })} data-slot="compare-block-state">
            {stateChipText(decision)}
          </span>
        ) : null}
      </div>
      <div className={slots.body({ ...(decision === null ? {} : { decision }) })}>
        {block.body ?? <PairBody added={added} block={block} cleared={cleared} slots={slots} />}
      </div>
      {onDecide !== undefined && decision !== null ? <ReviewVerbs cleared={cleared} decision={decision} name={name} onDecide={onDecide} slots={slots} /> : null}
      {onDecide === undefined && accepted !== undefined && onAcceptedChange !== undefined ? (
        <AcceptRow accepted={accepted} count={count} index={index} name={name} onAcceptedChange={onAcceptedChange} slots={slots} />
      ) : null}
    </div>
  );
}
