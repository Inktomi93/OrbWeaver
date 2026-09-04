import { expectTypeOf, test } from "vitest";
import type { HeapBrowserContextId, HeapCaptureSessionId, HeapTargetId } from "../../../../tooling/src/snap/contract/heap.ts";
import { heapBrowserContextIdSchema, heapCaptureSessionIdSchema, heapTargetIdSchema } from "../../../../tooling/src/snap/contract/heap.ts";

test("heap provenance identities remain distinct branded strings", () => {
  const session = heapCaptureSessionIdSchema.parse("session");
  const target = heapTargetIdSchema.parse("target");
  const context = heapBrowserContextIdSchema.parse("context");

  expectTypeOf(session).toEqualTypeOf<HeapCaptureSessionId>();
  expectTypeOf(target).toEqualTypeOf<HeapTargetId>();
  expectTypeOf(context).toEqualTypeOf<HeapBrowserContextId>();
  expectTypeOf<HeapCaptureSessionId>().not.toEqualTypeOf<HeapTargetId>();
  expectTypeOf<HeapTargetId>().not.toEqualTypeOf<HeapBrowserContextId>();
});
