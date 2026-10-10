import { LOCAL_TEXT_ENCODING } from "@orb/contracts/inference";
import { encodeTextWindows } from "../../../../packages/inference/src/backends/local-light/text-windows.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("native shape validation refuses batching, invalid lengths and an unrepresentable codepoint before inference", async () => {
  let forwards = 0;
  const forward = (): Promise<Float32Array> => {
    forwards += 1;
    return Promise.resolve(Float32Array.of(1));
  };
  for (const shape of [
    { batch: 2, length: 3 },
    { batch: 1, length: 0 },
    { batch: 1, length: Number.NaN },
    { batch: 1, length: 513 },
  ]) {
    await expect(encodeTextWindows("火", LOCAL_TEXT_ENCODING, (inputs) => Promise.resolve({ inputs, ...shape }), forward)).rejects.toMatchObject({
      retryable: false,
    });
  }
  expect(forwards).toBe(0);
});

test("a multi-window centroid averages normalized encoder directions rather than their arbitrary raw magnitudes", async () => {
  const consumed: string[] = [];
  const source = "a".repeat(8);
  const vector = await encodeTextWindows(
    source,
    LOCAL_TEXT_ENCODING,
    (inputs) => Promise.resolve({ inputs, batch: 1, length: inputs.length > 4 ? 513 : 6 }),
    (inputs) => {
      consumed.push(inputs);
      return Promise.resolve(consumed.length === 1 ? Float32Array.of(3, 0) : Float32Array.of(0, 4));
    },
  );
  expect(consumed.join("")).toBe(source);
  expect([...vector]).toEqual([expect.closeTo(Math.SQRT1_2), expect.closeTo(Math.SQRT1_2)]);
});
