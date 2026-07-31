// The React half of quoted-speech tinting: a `components.p` override that wraps every closed quote run
// (`dialogue.ts` owns the grammar) in a `text-dialogue` span. The token is per-theme AND per-character —
// every message row already mounts inside a `<ThemeScope>` carrying the speaker's authored
// `themeOverride`, so an authored `dialogueColor` wins here for free, exactly the way
// `[&_em]:text-narration` tints italics in the seal.
//
// Why a `components.p` override and not a remark/rehype plugin: Streamdown's sanitize schema allows
// `className` on `code` only, so a span minted upstream of rehype-sanitize would arrive stripped. This
// seam runs AFTER sanitize + harden, on already-safe React children — it can only re-wrap text that
// already rendered, and can never introduce markup.
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import type { StreamdownProps } from "streamdown";
import type { DialoguePart, DialoguePiece } from "./dialogue";
import { hasQuoteChar, splitDialogue } from "./dialogue";

/** An element child's participating text: only Streamdown's per-word streaming-reveal span, whose single
 *  string child IS the text (so a run still resolves mid-stream, not just after commit). Everything else
 *  is opaque — including inline `<code>`, which is why a quote inside code can't open a run. */
function atomicText(child: ReactNode): string {
  if (!isValidElement(child)) {
    return "";
  }
  const props = child.props as { readonly children?: unknown; readonly "data-sd-animate"?: unknown };
  return props["data-sd-animate"] === true && typeof props.children === "string" ? props.children : "";
}

function partOf(child: ReactNode): DialoguePart {
  return typeof child === "string" ? { text: child, atomic: false } : { text: atomicText(child), atomic: true };
}

function renderPieces(child: ReactNode, pieces: readonly DialoguePiece[], index: number): ReactNode {
  const [only] = pieces;
  if (only?.text === null) {
    return only.quoted ? (
      <span key={index} data-slot="dialogue" className="text-dialogue">
        {child}
      </span>
    ) : (
      child
    );
  }
  // Keyed by the piece's CHARACTER OFFSET within its child, not by array position: the pieces are a
  // re-split of one string, so the offset is the piece's real identity (and survives a re-split that
  // adds or drops a run earlier in the same paragraph).
  const out: ReactNode[] = [];
  let offset = 0;
  for (const piece of pieces) {
    const value = piece.text ?? "";
    out.push(
      piece.quoted ? (
        <span key={`${index}:${offset}`} data-slot="dialogue" className="text-dialogue">
          {value}
        </span>
      ) : (
        value
      ),
    );
    offset += value.length;
  }
  return out;
}

/** Wraps every closed quote run in the paragraph's children; returns `children` untouched when there is
 *  nothing to act on (the overwhelmingly common non-dialogue paragraph renders byte-identically). */
function tintDialogue(children: ReactNode): ReactNode {
  const list = Children.toArray(children);
  const parts = list.map(partOf);
  if (!parts.some((part) => hasQuoteChar(part.text))) {
    return children;
  }
  const pieces = splitDialogue(parts);
  return list.map((child, i) => renderPieces(child, pieces[i] ?? [], i));
}

/** react-markdown passes the source hast node alongside the DOM props; it is not a DOM attribute. */
type DialogueParagraphProps = ComponentPropsWithoutRef<"p"> & { readonly node?: unknown };

function DialogueParagraph({ node: _node, children, ...rest }: DialogueParagraphProps): ReactElement {
  return <p {...rest}>{tintDialogue(children)}</p>;
}

/** The seal's opt-in `components` override — paragraphs only. Headings/list items/table cells are chrome,
 *  and a card's own sandbox owns its styles; blockquote prose rides its inner `<p>` for free. */
export const DIALOGUE_COMPONENTS: NonNullable<StreamdownProps["components"]> = { p: DialogueParagraph };
