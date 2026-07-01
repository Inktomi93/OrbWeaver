import {
  cosineDistance,
  cosineSim,
  cosineToMany,
  l2Normalize,
  mean,
  pairwiseCosine,
} from "@orb/kit/vector-math";
import { expect, test } from "../../support/fixtures";

const v = (...xs: number[]): Float32Array => Float32Array.from(xs);
// Row-major index into a flat N×N matrix (kept out of the assertions so biome's no-implicit-coercion
// rule doesn't trip on a literal `1 * n`).
const at = (row: number, col: number, n: number): number => row * n + col;

test("cosineSim is the raw dot product (assumes normalized inputs)", () => {
  expect(cosineSim(v(1, 0), v(1, 0))).toBeCloseTo(1);
  expect(cosineSim(v(1, 0), v(0, 1))).toBeCloseTo(0);
  expect(cosineSim(v(0.6, 0.8), v(0.6, 0.8))).toBeCloseTo(1);
});

test("cosineSim throws on a dimension mismatch (loud, not a silent half-dot)", () => {
  expect(() => cosineSim(v(1, 0), v(1, 0, 0))).toThrow("dim mismatch");
});

test("cosineDistance renormalizes internally (1 − cos)", () => {
  expect(cosineDistance(v(3, 0), v(7, 0))).toBeCloseTo(0); // same direction, any scale
  expect(cosineDistance(v(3, 0), v(0, 5))).toBeCloseTo(1); // orthogonal
  expect(cosineDistance(v(1, 0), v(-1, 0))).toBeCloseTo(2); // opposite
});

test("cosineDistance guards a zero-norm vector (no NaN)", () => {
  expect(cosineDistance(v(0, 0), v(1, 0))).toBeCloseTo(1);
});

test("l2Normalize returns a unit-length copy; zero vector unchanged", () => {
  const out = l2Normalize(v(3, 4));
  expect(out[0]).toBeCloseTo(0.6);
  expect(out[1]).toBeCloseTo(0.8);
  const zero = l2Normalize(v(0, 0));
  expect(zero[0]).toBe(0);
  expect(zero[1]).toBe(0);
});

test("mean is the component-wise centroid; throws on empty input", () => {
  const c = mean([v(1, 2), v(3, 4)]);
  expect(c[0]).toBeCloseTo(2);
  expect(c[1]).toBeCloseTo(3);
  expect(() => mean([])).toThrow("empty");
});

test("pairwiseCosine builds a flat N×N row-major matrix, diagonal = 1", () => {
  const { sim, n } = pairwiseCosine([v(1, 0), v(0, 1), v(1, 0)]);
  expect(n).toBe(3);
  expect(sim[at(0, 0, n)]).toBeCloseTo(1); // self
  expect(sim[at(1, 1, n)]).toBeCloseTo(1);
  expect(sim[at(0, 1, n)]).toBeCloseTo(0); // orthogonal
  expect(sim[at(0, 2, n)]).toBeCloseTo(1); // identical direction
  expect(sim[at(2, 0, n)]).toBeCloseTo(1); // mirrored
});

test("pairwiseCosine on an empty list is an empty result", () => {
  const { sim, n } = pairwiseCosine([]);
  expect(n).toBe(0);
  expect(sim.length).toBe(0);
});

test("cosineToMany scores one target against each candidate", () => {
  const out = cosineToMany(v(1, 0), [v(2, 0), v(0, 9), v(1, 1)]);
  expect(out.length).toBe(3);
  expect(out[0]).toBeCloseTo(1); // same direction
  expect(out[1]).toBeCloseTo(0); // orthogonal
  expect(out[2]).toBeCloseTo(Math.SQRT1_2); // 45°
});

test("cosineToMany with no candidates is empty", () => {
  expect(cosineToMany(v(1, 0), []).length).toBe(0);
});
