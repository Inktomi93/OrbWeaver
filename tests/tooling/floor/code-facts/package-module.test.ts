// The module map both import gates and the deep-imports codemod judge by: which dir is a module, and which
// spelling enters it from outside.
import { packageModuleOf } from "../../../../tooling/src/floor/code-facts/package-module.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test.each([
  ["server", "domain/chat/verbs/send.ts", { key: "domain/chat", door: "#domain/chat", kind: "dir" }],
  ["server", "transport/rate-limit.ts", { key: "transport/rate-limit.ts", door: "#src/transport/rate-limit.ts", kind: "file" }],
  ["server", "index.ts", { key: "index.ts", door: "#src/index.ts", kind: "file" }],
  ["inference", "backends/google/wire.ts", { key: "backends/google", door: "#backends/google", kind: "dir" }],
  ["inference", "contract/errors.ts", { key: "contract", door: "#contract", kind: "dir" }],
  ["client", "features/chat/lib/x.ts", { key: "features/chat", door: "#features/chat", kind: "dir" }],
  ["client", "lib/agent-bridge.ts", { key: "lib", door: "#lib", kind: "dir" }],
  ["ui", "primitives/button/button.tsx", { key: "primitives/button", door: "#primitives/button", kind: "dir" }],
  ["ui", "layout/action-bar.tsx", { key: "layout/action-bar.tsx", door: "#src/layout/action-bar.tsx", kind: "file" }],
  ["kit", "ids/index.ts", { key: "ids", door: "#ids", kind: "dir" }],
] as const)("%s %s", (pkg, path, expected) => {
  expect(packageModuleOf(pkg, path)).toEqual(expected);
});
