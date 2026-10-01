import type { ChatContentPart, ContentSignatures, VariantMetadata } from "@orb/contracts/chat";

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

/** Signed boundaries must cover a complete canonical text run; edits cannot acquire a signature by substring. */
export function replayTextSignatures(parts: readonly ChatContentPart[], signatures: Snapshot | undefined): readonly ChatContentPart[] {
  if (signatures === undefined) {
    return parts;
  }
  return parts.flatMap((part): readonly ChatContentPart[] => {
    if (part.type !== "text") {
      return [part];
    }
    const matched = matchingRun(part.text, signatures.text);
    if (matched === undefined) {
      return [part];
    }
    const text = matched.map((item) => item.text).join("");
    const start = part.text.indexOf(text);
    const before = part.text.slice(0, start);
    const after = part.text.slice(start + text.length);
    return [
      ...(before.length === 0 ? [] : [{ type: "text" as const, text: before }]),
      ...matched.map(
        (item): ChatContentPart => ({
          type: "text",
          text: item.text,
          ...(item.thoughtSignature === undefined ? {} : { thoughtSignature: item.thoughtSignature }),
        }),
      ),
      ...(after.length === 0 ? [] : [{ type: "text" as const, text: after }]),
    ];
  });
}

function matchingRun(content: string, parts: Snapshot["text"]): Snapshot["text"] | undefined {
  const matches: Snapshot["text"][] = [];
  for (let start = 0; start < parts.length; start += 1) {
    let joined = "";
    for (let end = start; end < parts.length; end += 1) {
      joined += parts[end]?.text ?? "";
      if (joined.length > content.length) {
        break;
      }
      if (joined.length > 0 && joined.trim() === content.trim() && content.includes(joined)) {
        matches.push(parts.slice(start, end + 1));
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}
