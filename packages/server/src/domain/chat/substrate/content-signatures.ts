import type { ContentSignatures, ToolCallRecord, VariantMetadata } from "@orb/contracts/chat";

type Snapshot = NonNullable<ContentSignatures["previous"]>;

/** Read legacy phase before any lossy projection; current writers persist it explicitly. */
export function continuationToolsAreUndone(snapshot: NonNullable<VariantMetadata["continuationTools"]>, content: string): boolean {
  return snapshot.undone ?? content === snapshot.beforeContent;
}

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
  readonly beforeTools?: readonly ToolCallRecord[];
  readonly additionTools?: readonly ToolCallRecord[];
  readonly additionOffset?: number;
}): VariantMetadata | null {
  const before = signaturesForContent(args.before.contentSignatures, args.beforeContent);
  const addition = args.addition?.contentSignatures;
  const beforeTools = args.beforeTools ?? [];
  const addedTools = (args.additionTools ?? []).map((record) => ({
    ...record,
    ...(record.textOffset === undefined ? {} : { textOffset: record.textOffset + args.beforeContent.length + (args.additionOffset ?? 0) }),
    ...(record.exchangeTextEnd === undefined ? {} : { exchangeTextEnd: record.exchangeTextEnd + args.beforeContent.length + (args.additionOffset ?? 0) }),
  }));
  const toolMetadata: VariantMetadata =
    beforeTools.length + addedTools.length === 0
      ? {}
      : { continuationTools: { beforeContent: args.beforeContent, before: [...beforeTools], after: [...beforeTools, ...addedTools], undone: false } };
  if (before === undefined && addition === undefined) {
    return Object.keys(toolMetadata).length === 0 ? (args.addition ?? null) : { ...args.addition, ...toolMetadata };
  }
  const previous = {
    content: args.beforeContent,
    text: continuationParts(args.beforeContent, before),
    images: before?.images ?? [],
    tools: before?.tools ?? [],
  };
  return {
    ...args.addition,
    ...toolMetadata,
    contentSignatures: {
      content: args.beforeContent + args.additionContent,
      text: [...previous.text, ...continuationParts(args.additionContent, addition)],
      images: [...previous.images, ...(addition?.images ?? [])],
      tools: [...previous.tools, ...(addition?.tools ?? [])],
      previous,
    },
  };
}
