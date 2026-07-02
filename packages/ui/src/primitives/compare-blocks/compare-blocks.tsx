import type { ReactElement } from "react";
import { cn } from "#lib";
import { Checkbox } from "#primitives/checkbox";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Icon/Minus/Plus fine.
import { Icon, Minus, Plus } from "#primitives/icons";
import { compareBlocksVariants } from "./variants";

export interface CompareBlock {
  /**
   * Optional field name, shown above the pair. Present for the multi-field itemized shape (card
   * evolution); omitted for the single full-text pair (prose audit) — one component, no mode prop.
   */
  readonly label?: string;
  readonly before: string;
  readonly after: string;
}

export interface CompareBlocksProps {
  readonly blocks: readonly CompareBlock[];
  /**
   * Controlled per-block acceptance, parallel to `blocks`. Supplying BOTH this and
   * `onAcceptedChange` turns on the accept checkbox row per block, plus an "accept all" toggle
   * when there is more than one block (with one block, "accept all" would just duplicate the
   * block's own checkbox). Omit both for a read-only review with no accept affordance.
   */
  readonly accepted?: readonly boolean[];
  readonly onAcceptedChange?: (accepted: readonly boolean[]) => void;
  /** @default "Accept all" */
  readonly acceptAllLabel?: string;
  readonly className?: string;
}

/**
 * Before/After review (work order item 8) — renders `blocks` as intent-tinted pairs: before on the
 * danger token pair, after on the success token pair. Colorblind-safe by construction: each side
 * ALSO carries a glyph (Minus/Plus) plus visually-hidden "Before"/"After" text, so the distinction
 * never rests on tint alone. ONE component handles both shapes blocks.length pans out to — a
 * single full-text pair (prose audit) or N labeled itemized pairs (card evolution) — there is no
 * separate mode prop; a length-1 caller simply omits `label`.
 *
 * Distinct from `@orb/ui/diff` (token-level jsdiff segments): this renders two WHOLE strings
 * side-by-side, never a computed diff. The crew-specific proposal-diff wrapper (chat-crew-design/
 * 07 §4.2) composes this from `client/features`; it is not itself a ui concern.
 *
 * Usage: `<CompareBlocks blocks={[{ label: "Class", before: "Rogue", after: "Assassin" }]} accepted={a} onAcceptedChange={setA} />`
 */
export function CompareBlocks({
  blocks,
  accepted,
  onAcceptedChange,
  acceptAllLabel = "Accept all",
  className,
}: CompareBlocksProps): ReactElement {
  const slots = compareBlocksVariants();
  const canAccept = accepted !== undefined && onAcceptedChange !== undefined;

  function withAccepted(index: number, value: boolean): readonly boolean[] {
    return blocks.map((_, i) => (i === index ? value : (accepted?.[i] ?? false)));
  }

  function setAll(value: boolean): void {
    onAcceptedChange?.(blocks.map(() => value));
  }

  function setOne(index: number, value: boolean): void {
    onAcceptedChange?.(withAccepted(index, value));
  }

  const acceptedCount = accepted?.filter(Boolean).length ?? 0;
  const allAccepted = canAccept && blocks.length > 0 && acceptedCount === blocks.length;
  const someAccepted = canAccept && acceptedCount > 0 && !allAccepted;

  return (
    <div className={cn(slots.root(), className)} data-slot="compare-blocks">
      {canAccept && blocks.length > 1 ? (
        // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox control is nested inside.
        <label className={slots.acceptAllRow()} data-slot="compare-blocks-accept-all">
          <Checkbox
            checked={allAccepted}
            indeterminate={someAccepted}
            onCheckedChange={(value: boolean): void => setAll(value)}
          />
          <span className={slots.acceptAllLabel()}>{acceptAllLabel}</span>
        </label>
      ) : null}
      {blocks.map((block, index) => {
        const name = block.label ?? `change ${index + 1}`;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks is a fixed-order review snapshot for the lifetime of the review — there is no reorder/insert case.
          <div className={slots.block()} data-slot="compare-block" key={index}>
            {block.label !== undefined ? (
              <h3 className={slots.blockLabel()}>{block.label}</h3>
            ) : null}
            <div className={slots.pair()}>
              <div className={slots.panel({ side: "before" })} data-slot="compare-block-before">
                <span className={slots.sideHeader()}>
                  <Icon icon={Minus} size="xs" />
                  <span className={slots.srOnly()}>Before</span>
                </span>
                <p className={slots.text()}>{block.before}</p>
              </div>
              <div className={slots.panel({ side: "after" })} data-slot="compare-block-after">
                <span className={slots.sideHeader()}>
                  <Icon icon={Plus} size="xs" />
                  <span className={slots.srOnly()}>After</span>
                </span>
                <p className={slots.text()}>{block.after}</p>
              </div>
            </div>
            {canAccept ? (
              // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox control is nested inside.
              <label className={slots.acceptRow()} data-slot="compare-block-accept">
                <Checkbox
                  checked={accepted?.[index] ?? false}
                  onCheckedChange={(value: boolean): void => setOne(index, value)}
                />
                <span className={slots.acceptLabel()}>
                  Accept<span className={slots.srOnly()}> {name}</span>
                </span>
              </label>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
