import { vi } from "vitest";
import { loadDecided } from "#p/domain/d/persistence/io.ts";
import { pure } from "#p/domain/d/substrate/pure.ts";

vi.mock("#p/domain/d/persistence/io.ts", () => ({ loadDecided: () => null }));
vi.mock("../../../../packages/p/src/domain/d/persistence/io.ts");
const actual = await vi.importActual("#p/domain/d/persistence/io.ts");
const other = { mock: (name: string): string => name };
other.mock("#p/domain/d/substrate/io.ts");

export const cases = [loadDecided, pure, actual];
