// Wire-output builder for the world-info book import (`worldInfo.importFile`): a newly created, unrenamed book.

import { createBookSchema } from "@orb/contracts/world-info";
import type { TrpcWireOutput } from "../route-trpc.ts";

type WorldInfoImportWire = TrpcWireOutput<"worldInfo.importFile">;

export function makeWorldInfoImportResult(overrides: Partial<WorldInfoImportWire> = {}): WorldInfoImportWire {
  return { created: true, name: createBookSchema.shape.name.parse("World book"), renamedFrom: null, ...overrides };
}
