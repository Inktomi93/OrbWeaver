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
import type { ComponentPropsWithoutRef, CSSProperties, ReactElement, ReactNode } from "react";
// @orb-gate-ignore no-legacy-react-api: the markdown seal transforms ALREADY-RENDERED children
// (this is a `components.p` override running after sanitize), so children ARE the library's interface here;
// there is no data array to map instead. Ends if Streamdown ever hands the seam its source nodes.
import { Children, isValidElement } from "react";
import type { StreamdownProps } from "streamdown";
import type { DialoguePart, DialoguePiece } from "./dialogue.ts";
import { hasQuoteChar, splitDialogue } from "./dialogue.ts";

/** An element child's participating text: only the seal's per-word streaming-reveal span
 *  (`reveal-plugin.ts`, `data-orb-reveal`), whose single string child IS the text (so a run still
 *  resolves mid-stream, not just after commit). Everything else is opaque — including inline
 *  `<code>`, which is why a quote inside code can't open a run. */
function atomicText(child: ReactNode): string {
  if (!isValidElement(child)) {
    return "";
  }
  const props = child.props as { readonly children?: unknown; readonly "data-orb-reveal"?: unknown };
  return props["data-orb-reveal"] === true && typeof props.children === "string" ? props.children : "";
}

function partOf(child: ReactNode): DialoguePart {
  return typeof child === "string" ? { text: child, atomic: false } : { text: atomicText(child), atomic: true };
}

/** The reveal-fade props a re-split must CARRY (#42): a piece minted from a mid-fade word span keeps
 *  `data-orb-reveal` + the span's negative `animation-delay`, so tinting a quote never restarts or
 *  strips the word's fade (the reveal anchors progress to reveal TIME — reveal-plugin.ts header). */
function revealPropsOf(child: ReactNode): { readonly "data-orb-reveal": true; readonly style?: CSSProperties } | null {
  if (!isValidElement(child)) {
    return null;
  }
  const props = child.props as { readonly "data-orb-reveal"?: unknown; readonly style?: CSSProperties };
  if (props["data-orb-reveal"] !== true) {
    return null;
  }
  return props.style === undefined ? { "data-orb-reveal": true } : { "data-orb-reveal": true, style: props.style };
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
  const reveal = revealPropsOf(child);
  const out: ReactNode[] = [];
  let offset = 0;
  for (const piece of pieces) {
    const value = piece.text ?? "";
    if (piece.quoted) {
      out.push(
        <span key={`${index}:${offset}`} data-slot="dialogue" className="text-dialogue" {...(reveal ?? {})}>
          {value}
        </span>,
      );
    } else if (reveal !== null) {
      // An unquoted piece cut out of a revealing word span keeps its fade — a bare string here would
      // strip the animation and pop the word to full opacity mid-fade.
      out.push(
        <span key={`${index}:${offset}`} {...reveal}>
          {value}
        </span>,
      );
    } else {
      out.push(value);
    }
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
