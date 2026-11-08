import { other } from "./other.ts";
import { ROW_ESTIMATE_PX } from "#lib";
import { LAYOUT_SUBPIXEL_PX } from "@orb/testkit/browser/spec";




export const size = (): number => ROW_ESTIMATE_PX.compact + other;
export const estimate = { height: ROW_ESTIMATE_PX.compact, near: (a: number, b: number): boolean => Math.abs(a - b) <= LAYOUT_SUBPIXEL_PX };
