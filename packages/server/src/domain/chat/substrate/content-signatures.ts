import type { ContentSignatures, VariantMetadata } from "@orb/contracts/chat";

type Snapshot = NonNullable<ContentSignatures["previous"]>;

/** Undo and revert select an exact canonical snapshot without exposing provenance in message views. */
export function signaturesForContent(signatures: ContentSignatures | undefined, content: string): Snapshot | undefined {
  if (signatures === undefined) {
    return;
  }
  if (signatures.content === undefined || signatures.content === content) {
    return signatures;
  }
  if (signatures.previous?.content === content) {
    return signatures.previous;
  }
  return signatures.images.length === 0 ? undefined : { text: [], images: signatures.images };
}

function continuationParts(content: string, signatures: Snapshot | undefined): Snapshot["text"] {
  if (signatures === undefined || signatures.text.length === 0) {
    return [{ text: content }];
  }
  const represented = signatures.content ?? signatures.text.map((part) => part.text).join("");
  if (represented === content) {
    return signatures.text;
  }
  if (signatures.content !== undefined && content.endsWith(represented)) {
    return [{ text: content.slice(0, content.length - represented.length) }, ...signatures.text];
  }
  return [{ text: content }];
}

/** Preserve current and pre-continue boundaries in the existing private metadata, bounded to one undo snapshot. */
export function continuedSignatureMetadata(args: {
  readonly beforeContent: string;
  readonly additionContent: string;
  readonly before: VariantMetadata;
  readonly addition: VariantMetadata | null | undefined;
}): VariantMetadata | null {
  const before = signaturesForContent(args.before.contentSignatures, args.beforeContent);
  const addition = args.addition?.contentSignatures;
  if (before === undefined && addition === undefined) {
    return args.addition ?? null;
  }
  const previous = { content: args.beforeContent, text: continuationParts(args.beforeContent, before), images: before?.images ?? [] };
  return {
    ...args.addition,
    contentSignatures: {
      content: args.beforeContent + args.additionContent,
      text: [...previous.text, ...continuationParts(args.additionContent, addition)],
      images: [...previous.images, ...(addition?.images ?? [])],
      previous,
    },
  };
}
