import type { RerankRun } from "@orb/kit/rerank";
import { applyRerank } from "@orb/kit/rerank";
import { expect, test } from "@orb/testkit/node";

interface Candidate {
  readonly id: string;
  readonly sourceText: string | null;
}

/** A runner that returns the given ids, in order, as the hits it scored. */
function runnerReturning(order: readonly string[]): RerankRun {
  return () => Promise.resolve({ hits: order.map((id) => ({ id })) });
}

const refusing: RerankRun = () => Promise.reject(new Error("the runner must not be called"));

const ALPHA_TO_CHARLIE: readonly Candidate[] = [
  { id: "a", sourceText: "alpha" },
  { id: "b", sourceText: "bravo" },
  { id: "c", sourceText: "charlie" },
];

test("scorable candidates follow the runner's hit order, capped to topN", async () => {
  const out = await applyRerank("q", ALPHA_TO_CHARLIE, runnerReturning(["c", "a", "b"]), 2);
  expect(out.map((candidate) => candidate.id)).toEqual(["c", "a"]);
});

test("unscorable candidates go after the ranked ones, and the runner sees only the scorable documents", async () => {
  const candidates: Candidate[] = [
    { id: "a", sourceText: "alpha" },
    { id: "b", sourceText: null },
    { id: "c", sourceText: "   " },
    { id: "d", sourceText: "delta" },
  ];
  const sent: string[][] = [];
  const out = await applyRerank(
    "q",
    candidates,
    (_query, documents) => {
      sent.push(documents.map((document) => document.id));
      return Promise.resolve({ hits: [{ id: "d" }, { id: "a" }] });
    },
    10,
  );
  expect(out.map((candidate) => candidate.id)).toEqual(["d", "a", "b", "c"]);
  expect(sent).toEqual([["a", "d"]]);
});

test("scorable candidates the runner omits keep their incoming order after the ranked ones", async () => {
  const out = await applyRerank("q", ALPHA_TO_CHARLIE, runnerReturning(["b"]), 10);
  expect(out.map((candidate) => candidate.id)).toEqual(["b", "a", "c"]);
});

test("a hit naming an id the caller never sent, or naming one twice, places nothing twice", async () => {
  const out = await applyRerank("q", ALPHA_TO_CHARLIE, runnerReturning(["ghost", "c", "c"]), 10);
  expect(out.map((candidate) => candidate.id)).toEqual(["c", "a", "b"]);
});

test("with no scorable candidate the incoming order is capped and the runner is never called", async () => {
  const candidates: Candidate[] = [
    { id: "a", sourceText: null },
    { id: "b", sourceText: "" },
    { id: "c", sourceText: "   " },
  ];
  const out = await applyRerank("q", candidates, refusing, 2);
  expect(out.map((candidate) => candidate.id)).toEqual(["a", "b"]);
});

test("a runner rejection propagates instead of falling back to the incoming order", async () => {
  await expect(applyRerank("q", ALPHA_TO_CHARLIE, () => Promise.reject(new Error("rerank not supported")), 10)).rejects.toThrow("rerank not supported");
});
