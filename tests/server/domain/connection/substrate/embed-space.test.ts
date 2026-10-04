// substrate: the embed-space TRIGGER'S CONDITION (§10-4) — `vectorSpacesOf` snapshots what `(model[@dtype])`
// space each vector task resolves to, and `spacesNeedRebuild` decides whether a connection write moved a task onto
// a space its corpus must be rebuilt in. The purge+reindex it gates is DESTRUCTIVE and expensive, so BOTH failure directions are defects:
// a missed change leaves vectors readable in a geometry nothing queries any more, while a false positive
// re-embeds the whole box on an unrelated `declared` edit. This file drives exactly the comparison — the
// resolve is faked at the ONE edge the module touches (`runtime.resolve`, the module's whole dependency),
// so the edges under test are the tag derivation and the diff, not the resolver.
//
// The `null` arm is a SEPARATE fact, not a degenerate case: a refused resolve (unbound / unservable /
// unfundable) folds to "no space". Moving TO it never fires (nothing can embed there, and the old generation
// stays for a later re-bind), while moving FROM it does (a task that just gained a space).

import type { Capability, Task } from "@orb/contracts/inference";
import type { ResolveArgs, ResolveOutcome } from "@orb/inference";
import type { ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { spacesNeedRebuild, VECTOR_TASKS, vectorSpacesOf } from "../../../../../packages/server/src/domain/connection/substrate/embed-space.ts";
import { principal } from "../../../../support/factories/principal.ts";
import { makeResolved } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CALLER = principal(castId<UserId>("user_space_owner"));

function embedding(dtype?: string, dims = 1024, mrl = false): Capability {
  return {
    kind: "embedding",
    embedding: {
      dims,
      mrl,
      maxInputTokens: 512,
      input: ["text"],
      output: ["vector"],
      instructionAware: false,
      ...(dtype === undefined ? {} : { dtype }),
    },
  };
}

/** A runtime whose `resolve` answers per task from `spaces`; a task absent from the map REFUSES (the
 *  unbound/unservable reading the verb must fold to `null`). */
function runtimeOver(spaces: Partial<Record<Task, { readonly model: string; readonly dtype?: string; readonly dims?: number; readonly mrl?: boolean }>>): {
  readonly runtime: { readonly resolve: (args: ResolveArgs) => Promise<ResolveOutcome> };
} {
  return {
    runtime: {
      resolve: ({ task }: ResolveArgs): Promise<ResolveOutcome> => {
        const row = spaces[task];
        if (row === undefined) {
          return Promise.reject(new Error(`no connection is bound for "${task}"`));
        }
        return Promise.resolve({
          resolved: makeResolved({ task, model: castId<ModelId>(row.model), capability: embedding(row.dtype, row.dims, row.mrl) }),
          warnings: [],
        });
      },
    },
  };
}

test("the snapshot carries EVERY vector task, and the tag folds the served dtype into the model", async () => {
  const spaces = await vectorSpacesOf(runtimeOver({ embed: { model: "jina-clip-v2", dtype: "q8" }, imageEmbed: { model: "jina-clip-v2" } }), CALLER);

  expect(Object.keys(spaces).sort(), "one entry per vector task — a missing key would read as an unchanged space").toEqual([...VECTOR_TASKS].sort());
  expect(spaces["embed"], "the dtype rides INSIDE the tag — a re-quantised encoder is a different space").toMatchObject({
    model: "jina-clip-v2@q8",
    dim: 1024,
  });
  expect(spaces["imageEmbed"], "no served precision ⇒ the bare model id").toMatchObject({ model: "jina-clip-v2", dim: 1024 });
});

test("a REFUSED resolve reads as `null`, never as a thrown write", async () => {
  const spaces = await vectorSpacesOf(runtimeOver({ embed: { model: "jina-clip-v2" } }), CALLER);

  expect(spaces["imageEmbed"], "an unbound task has no vectors to strand").toBeNull();
  expect(spaces["embed"]).toMatchObject({ model: "jina-clip-v2", dim: 1024 });
});

test("an identical snapshot does NOT fire the trigger — including when every task is unbound", async () => {
  const bound = await vectorSpacesOf(runtimeOver({ embed: { model: "jina-clip-v2", dtype: "q8" }, imageEmbed: { model: "siglip2" } }), CALLER);
  expect(spacesNeedRebuild(bound, bound)).toBe(false);

  const empty = await vectorSpacesOf(runtimeOver({}), CALLER);
  expect(spacesNeedRebuild(empty, empty), "`null` vs `null` is NO change — an unbound box must not reindex").toBe(false);
});

test("a MOVED space fires — on the model, on the dtype alone, and on gaining one; never on losing one", async () => {
  const q8 = await vectorSpacesOf(runtimeOver({ embed: { model: "jina-clip-v2", dtype: "q8" } }), CALLER);
  const fp16 = await vectorSpacesOf(runtimeOver({ embed: { model: "jina-clip-v2", dtype: "fp16" } }), CALLER);
  const other = await vectorSpacesOf(runtimeOver({ embed: { model: "siglip2", dtype: "q8" } }), CALLER);
  const none = await vectorSpacesOf(runtimeOver({}), CALLER);

  expect(spacesNeedRebuild(q8, fp16), "the SAME weights at another precision are another geometry (#2417)").toBe(true);
  expect(spacesNeedRebuild(q8, other), "a different model is a different space").toBe(true);
  expect(spacesNeedRebuild(q8, none), "a task that LOST its binding has nothing to embed with").toBe(false);
  expect(spacesNeedRebuild(none, q8), "a task that GAINED one has nothing in the new space yet").toBe(true);
});

test("a move on the IMAGE task alone fires — the condition is any vector task, not just `embed`", async () => {
  const before = await vectorSpacesOf(runtimeOver({ embed: { model: "jina-clip-v2" }, imageEmbed: { model: "siglip2" } }), CALLER);
  const after = await vectorSpacesOf(runtimeOver({ embed: { model: "jina-clip-v2" }, imageEmbed: { model: "siglip2", dtype: "q8" } }), CALLER);

  expect(spacesNeedRebuild(before, after)).toBe(true);
});

test("a stated width change triggers reindex even with unchanged model and precision", async () => {
  const before = await vectorSpacesOf(runtimeOver({ embed: { model: "same-encoder", dims: 3072, mrl: true } }), CALLER);
  const after = await vectorSpacesOf(runtimeOver({ embed: { model: "same-encoder", dims: 768, mrl: true } }), CALLER);
  expect(after["embed"]).toMatchObject({ dim: 768 });
  expect(spacesNeedRebuild(before, after)).toBe(true);
});

test("native MRL dimension changes reindex because they change concrete encoder provenance", async () => {
  const before = await vectorSpacesOf(runtimeOver({ embed: { model: "same-encoder", dims: 1536, mrl: true } }), CALLER);
  const after = await vectorSpacesOf(runtimeOver({ embed: { model: "same-encoder", dims: 3072, mrl: true } }), CALLER);
  expect(spacesNeedRebuild(before, after)).toBe(true);
});

test("a narrower non-MRL model is a space at its own width, not a refusal", async () => {
  const before = await vectorSpacesOf(runtimeOver({ embed: { model: "same-encoder", dims: 1024 } }), CALLER);
  const after = await vectorSpacesOf(runtimeOver({ embed: { model: "same-encoder", dims: 768 } }), CALLER);
  expect(after.embed).toMatchObject({ dim: 768 });
  expect(spacesNeedRebuild(before, after)).toBe(true);
});
