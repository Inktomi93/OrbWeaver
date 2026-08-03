// The rack's drag→form-move recovery. The bug this pins: a first-divergence diff is only correct for
// ±1-slot drags — it silently persists the wrong order for any longer move. @dnd-kit and
// form.moveFieldValues share arrayMove's splice semantics, so the invariant is: applying the recovered
// (from,to) reproduces the array the user actually sees. We assert on the RESULT array (not the pair),
// because an adjacent swap is legitimately recoverable from either end.

import { diffMove } from "../../../../../../packages/client/src/features/preset/components/prompt-assembly/reorder-move.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

// Faithful arrayMove — the exact splice-out/splice-in both @dnd-kit and TanStack form apply.
function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

const BASE = ["a", "b", "c", "d", "e", "f"] as const;

test("diffMove recovers the visible order for EVERY single-element drag (>1-slot included)", () => {
  const mismatches: string[] = [];
  for (let from = 0; from < BASE.length; from++) {
    for (let to = 0; to < BASE.length; to++) {
      if (from === to) {
        continue;
      }
      const after = arrayMove(BASE, from, to);
      const move = diffMove(BASE, after);
      if (move === null) {
        mismatches.push(`${from}->${to}: recovered null`);
        continue;
      }
      const applied = arrayMove(BASE, move.from, move.to).join("");
      if (applied !== after.join("")) {
        mismatches.push(`${from}->${to}: got ${applied} want ${after.join("")}`);
      }
    }
  }
  expect(mismatches).toEqual([]);
});

test("diffMove gets the >1-slot moves the naive first-divergence diff got wrong", () => {
  // 0→2 on [a,b,c,d] yields [b,c,a,d]; the naive diff returned {0,1} → [b,a,c,d]. Prove the fix.
  expect(diffMove(["a", "b", "c", "d"], ["b", "c", "a", "d"])).toEqual({ from: 0, to: 2 });
  // 3→0 (long move up) yields [d,a,b,c].
  expect(diffMove(["a", "b", "c", "d"], ["d", "a", "b", "c"])).toEqual({ from: 3, to: 0 });
});

test("diffMove returns null when nothing moved", () => {
  expect(diffMove([...BASE], [...BASE])).toBeNull();
});
