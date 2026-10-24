import { expectTypeOf, test } from "vitest";
import type { UpdateVerdict } from "#client/features/plugin/components/plugin-row-leaves.tsx";

test("available plugin updates retain the canonical source-specific proof", () => {
  type Common = Pick<Extract<UpdateVerdict, { kind: "available" }>, "kind" | "label" | "ariaLabel">;
  type Proof = Extract<UpdateVerdict, { kind: "available" }>["proof"];
  type GitProof = Extract<Proof, { status: "source-changed" }>;
  type UrlProof = Extract<Proof, { source: "url" }>;
  expectTypeOf<Common & { proof: Omit<GitProof, "sourceCommit"> }>().not.toExtend<UpdateVerdict>();
  expectTypeOf<Common & { proof: Omit<UrlProof, "bundleHash"> }>().not.toExtend<UpdateVerdict>();
  expectTypeOf<Common & { proof: GitProof }>().toExtend<UpdateVerdict>();
  expectTypeOf<Common & { proof: UrlProof }>().toExtend<UpdateVerdict>();
  expectTypeOf<Common & { proof: Extract<Proof, { source: "showcase" }> }>().toExtend<UpdateVerdict>();
});
