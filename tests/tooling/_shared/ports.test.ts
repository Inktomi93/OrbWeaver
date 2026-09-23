// THE POINT OF THE REGISTRY IS THIS FILE (tooling/src/_shared/ports.ts).
// The band range and the reserved rows are disjoint by
// ARITHMETIC — two bases chosen above every reserved number, a stride of 10, ten bands — and arithmetic
// nobody asserts is a coincidence waiting for an edit. Widening STAGE_BAND_COUNT, shrinking the stride,
// lowering a base or reserving a new pair inside the band range all go RED here rather than at 2am on a
// port some other stack was already serving.
//
// Every negative assertion below ships its POSITIVE CONTROL in the same test: `overlap` is proven to FIND
// a collision on a planted input before it is trusted to report none on the real one. A bare empty array
// is "I could not measure", never "there is nothing there".
import {
  CT_VITE_PORT,
  DEV_PORTS,
  E2E_FIXTURE_PROVIDER_PORT,
  E2E_PORTS,
  ENGINE_PORTS,
  FIXTURE_PORTS,
  MODEL_AB_PORT,
  RESERVED_PORT_NUMBERS,
  RESERVED_PORTS,
  reservedPort,
  STAGE_BAND_COUNT,
  STAGE_BAND_PORT_NUMBERS,
  STAGE_BANDS,
  stageBandForPort,
  stageBandPorts,
} from "@orb/tooling/_shared/ports";
import { expect, test } from "../../support/tool-fixtures.ts";

/** Which of `ports` are also in `against`. The instrument the disjointness claim rides on — so every use
 *  below is paired with a planted positive control that forces it to return a non-empty answer. */
function overlap(ports: Iterable<number>, against: ReadonlySet<number>): number[] {
  return [...ports].filter((port) => against.has(port));
}

// ── THE DISJOINTNESS PIN ──────────────────────────────────────────────────────────────────────────────

test("no stage band may land on a reserved port", () => {
  // POSITIVE CONTROL FIRST: a planted band-shaped set that DOES collide must be reported, or the empty
  // answer below proves nothing about the real sets.
  expect(overlap([DEV_PORTS.server, MODEL_AB_PORT, 9999], RESERVED_PORT_NUMBERS)).toEqual([DEV_PORTS.server, MODEL_AB_PORT]);

  expect(overlap(STAGE_BAND_PORT_NUMBERS, RESERVED_PORT_NUMBERS)).toEqual([]);
});

test("the band range clears every port the design names by number", () => {
  // §3.6's exclusion list, spelled as LITERALS on purpose: this test is the place the design's numbers and
  // the module's numbers are checked against each other, so deriving both sides from the module would make
  // the assertion circular.
  const designExclusions = [8790, 5175, 8796, 8797, 8798, 8799, 5181, 5182, 5183, 8901, 3100, 8701, 8702, 8703, 8788, 5173];
  expect(overlap(designExclusions, STAGE_BAND_PORT_NUMBERS)).toEqual([]);
  // …and the same literals really are the rows this module declares — an exclusion list that had drifted
  // from the registry would clear the bands for free.
  expect(overlap(designExclusions, RESERVED_PORT_NUMBERS).sort((a, b) => a - b)).toEqual([...designExclusions].sort((a, b) => a - b));
});

test("the reserved table declares each port exactly once", () => {
  const ports = RESERVED_PORTS.map((row) => row.port);
  expect(new Set(ports).size).toBe(ports.length);
  expect(RESERVED_PORT_NUMBERS.size).toBe(ports.length);
});

// ── the band arithmetic ───────────────────────────────────────────────────────────────────────────────

test("band k is server 8888 + 10k and vite 5273 + 10k", () => {
  expect(STAGE_BANDS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Band 0 is the pair snap has always used, so the registry is byte-compatible with the one fixed band.
  expect(stageBandPorts(0)).toEqual({ server: 8888, vite: 5273 });
  expect(stageBandPorts(1)).toEqual({ server: 8898, vite: 5283 });
  expect(stageBandPorts(STAGE_BAND_COUNT - 1)).toEqual({ server: 8978, vite: 5363 });
});

test("an out-of-range band throws instead of returning ports nobody reserved", () => {
  expect(() => stageBandPorts(STAGE_BAND_COUNT)).toThrow(/outside 0\.\.9/u);
  expect(() => stageBandPorts(-1)).toThrow(/outside 0\.\.9/u);
  expect(() => stageBandPorts(1.5)).toThrow(/outside 0\.\.9/u);
});

test("a port names its band from either side of the pair", () => {
  expect(stageBandForPort(8888)).toBe(0);
  expect(stageBandForPort(5273)).toBe(0);
  expect(stageBandForPort(8908)).toBe(2);
  expect(stageBandForPort(5293)).toBe(2);
  expect(stageBandForPort(DEV_PORTS.vite)).toBeNull();
});

// ── the named rows the consumers read ─────────────────────────────────────────────────────────────────

test("the registry carries the pairs its consumers used to spell by hand", () => {
  expect(DEV_PORTS).toEqual({ server: 8788, vite: 5173 });
  expect(FIXTURE_PORTS).toEqual({ server: 8790, vite: 5175 });
  expect(E2E_PORTS.singleUser).toEqual({ server: 8796, vite: 5181 });
  expect(E2E_PORTS.forwardHeader).toEqual({ server: 8798, vite: 5182 });
  expect(E2E_PORTS.local).toEqual({ server: 8799, vite: 5183 });
  expect(E2E_FIXTURE_PROVIDER_PORT).toBe(8797);
  expect(MODEL_AB_PORT).toBe(8901);
  expect(CT_VITE_PORT).toBe(3100);
  expect(ENGINE_PORTS).toEqual({ embed: 8701, rerank: 8702, generate: 8703 });
});

test("a reserved port names its owner, and an unreserved one names nobody", () => {
  expect(reservedPort(DEV_PORTS.server)?.owner).toBe("dev stack");
  expect(reservedPort(CT_VITE_PORT)?.role).toBe("vite");
  expect(reservedPort(ENGINE_PORTS.generate)?.role).toBe("engine");
  // A band port is deliberately NOT reserved — that is what makes it allocatable.
  expect(reservedPort(8888)).toBeUndefined();
});
