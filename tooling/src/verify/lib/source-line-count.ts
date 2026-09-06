import type { SourceFile } from "ts-morph";

/** Match the legacy gate convention: a single terminal LF terminates the last line, it does not add one. */
export function authoredLineCount(sourceFile: SourceFile): number {
  const text = sourceFile.getFullText();
  const authored = text.endsWith("\n") ? text.slice(0, -1) : text;
  return authored.split("\n").length;
}
