// Production graph control for #2559. The schema/read half is insufficient: if the one production INSERT
// disappears while `loadStreamReplay` remains, the resumable token log silently returns to read-only
// scaffolding. The real-tree assertion closes that regression; the in-memory source mutation proves the
// structural lens actually bites rather than passing because it failed to scan.

import { resolve } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import { beforeAll, describe } from "vitest";
import { expect, test } from "../support/tool-fixtures.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const WRITER_PATH = resolve(ROOT, "packages/server/src/domain/chat/persistence/stream-events.ts");
const READER_PATH = resolve(ROOT, "packages/server/src/domain/chat/persistence/queries.ts");

let writer: import("ts-morph").SourceFile;
let reader: import("ts-morph").SourceFile;

function graphCounts(): { readonly readers: number; readonly writers: number } {
  const readers = reader.getDescendantsOfKind(SyntaxKind.Identifier).filter((node) => node.getText() === "chatStreamEvents").length;
  const writers = writer.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expression = call.getExpression();
    const table = call.getArguments()[0];
    return (
      Node.isPropertyAccessExpression(expression) && expression.getName() === "insert" && Node.isIdentifier(table) && table.getText() === "chatStreamEvents"
    );
  }).length;
  return { readers, writers };
}

beforeAll(() => {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  writer = project.addSourceFileAtPath(WRITER_PATH);
  reader = project.addSourceFileAtPath(READER_PATH);
});

describe("chat_stream_events production writer graph", () => {
  test("production readers retain exactly one canonical INSERT door", () => {
    const graph = graphCounts();
    expect(graph.readers).toBeGreaterThan(0);
    expect(graph.writers).toBe(1);
  });

  test("planted writer removal leaves the existing readers visible and turns every required field unwritten", () => {
    const original = writer.getFullText();
    writer.replaceWithText(original.replaceAll("chatStreamEvents", "chatEvents"));
    try {
      const graph = graphCounts();
      expect(graph.readers).toBeGreaterThan(0);
      expect(graph.writers).toBe(0);
    } finally {
      writer.replaceWithText(original);
    }
  });
});
