import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModalDefinition, SectionDefinition } from "@orb/client/state";
import { MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { createAuthedComposition, createClientRuntime } from "@orb/testkit/browser";
import { expect, test } from "@orb/testkit/node";

const CLIENT_SRC = fileURLToPath(new URL("../../../packages/client/src", import.meta.url));
const SINGLETON_PLACEMENT = "mobile-tab" satisfies ModalDefinition["trigger"]["placement"];
const SURFACE_PLACEMENT = "surface" satisfies ModalDefinition["trigger"]["placement"];
const PAIR_SEPARATOR = "␟";

// The assembly the shell reads: the production door over a runtime that never reaches the network.
const composition = createAuthedComposition(createClientRuntime("http://127.0.0.1:0"));
const sections = composition.sections.list();
const modals = composition.modals.list();

type CopySection = Pick<SectionDefinition, "id" | "placeholder">;

/** One finding per section whose placeholder copy is empty or repeats an earlier section's (title, description) pair. */
function copyDefects(list: readonly CopySection[]): string[] {
  const claimed = new Map<string, string>();
  const defects: string[] = [];
  for (const { id, placeholder } of list) {
    if (placeholder.title.trim().length === 0 || placeholder.description.trim().length === 0) {
      defects.push(`empty copy: ${id}`);
      continue;
    }
    const key = `${placeholder.title}${PAIR_SEPARATOR}${placeholder.description}`;
    const owner = claimed.get(key);
    if (owner === undefined) {
      claimed.set(key, id);
    } else {
      defects.push(`duplicate copy: ${id} repeats ${owner}`);
    }
  }
  return defects;
}

/** The planned-reason defect of one modal body, if any. */
function bodyDefect(modal: ModalDefinition): string | undefined {
  return typeof modal.body === "function" || modal.body.planned.trim().length > 0 ? undefined : `empty planned reason: ${modal.id}`;
}

/** One finding per modal-registry dishonesty: a repeated id, two mobile-tab doors, an empty planned reason. */
function modalDefects(list: readonly ModalDefinition[]): string[] {
  const defects: string[] = [];
  const ids = new Set<string>();
  let singleton: string | undefined;
  for (const modal of list) {
    if (ids.has(modal.id)) {
      defects.push(`duplicate id: ${modal.id}`);
    }
    ids.add(modal.id);
    if (modal.trigger.placement === SINGLETON_PLACEMENT) {
      if (singleton !== undefined) {
        defects.push(`duplicate ${SINGLETON_PLACEMENT}: ${modal.id} repeats ${singleton}`);
      }
      singleton ??= modal.id;
    }
    const defect = bodyDefect(modal);
    if (defect !== undefined) {
      defects.push(defect);
    }
  }
  return defects;
}

interface HomeExport {
  readonly file: string;
  readonly name: string;
  readonly value: unknown;
}

function isModalDefinition(value: unknown): value is ModalDefinition {
  return typeof value === "object" && value !== null && "id" in value && "trigger" in value && "body" in value;
}

/** One finding per modal definition a modal home exports that the door never assembled. */
function unassembledModals(exported: readonly HomeExport[], assembled: readonly ModalDefinition[]): string[] {
  return exported
    .filter(({ value }) => isModalDefinition(value) && !assembled.includes(value))
    .map(({ file, name }) => `unassembled modal: ${file} exports ${name}`);
}

async function modalHomeExports(): Promise<readonly HomeExport[]> {
  const files = readdirSync(CLIENT_SRC, { recursive: true, encoding: "utf8" }).filter((path) => /^features\/[^/]+\/lib\/[^/]+-modal\.tsx?$/u.test(path));
  const loaded = await Promise.all(
    files.map(async (file) => {
      const module: Record<string, unknown> = await import(join(CLIENT_SRC, file));
      return Object.entries(module).map(([name, value]) => ({ file, name, value }));
    }),
  );
  return loaded.flat();
}

const homeExports = await modalHomeExports();

const real = (id: ModalDefinition["id"]): ModalDefinition => composition.modals.get(id);

test("every rail section gives its own non-empty, distinct placeholder copy", () => {
  expect(sections.map(({ id }) => id)).toEqual([...SECTION_IDS]);
  expect(copyDefects(sections)).toEqual([]);
});

test("section copy defects: repeated pairs, empty copy and aliased copy are named; a shared title alone is not", () => {
  const [first, second] = sections;
  if (first === undefined || second === undefined) {
    throw new Error("the production door assembled fewer than two sections");
  }
  const shared = first.placeholder;
  expect(copyDefects([first, { ...second, placeholder: { ...shared } }])).toEqual([`duplicate copy: ${second.id} repeats ${first.id}`]);
  expect(copyDefects([{ ...first, placeholder: { ...shared, title: "" } }])).toEqual([`empty copy: ${first.id}`]);
  expect(copyDefects([first, { ...second, placeholder: { title: shared.title, description: `${shared.description} (other)` } }])).toEqual([]);
  expect(
    copyDefects([
      { ...first, placeholder: shared },
      { ...second, placeholder: second.placeholder },
    ]),
  ).toEqual([]);
});

test("the modal registry is total, id-aligned with its slot vocabulary and free of dishonest doors", () => {
  expect(modals.map(({ id }) => id)).toEqual([...MODAL_SLOT_IDS]);
  expect(modalDefects(modals)).toEqual([]);
});

test("modal defects: a repeated id, a second mobile-tab door, and an empty planned reason are named", () => {
  const you = real("you");
  const surfaceModal = modals.find((modal) => modal.trigger.placement === SURFACE_PLACEMENT && typeof modal.body === "function");
  if (surfaceModal === undefined) {
    throw new Error("the production door registers no surface modal");
  }
  expect(you.trigger.placement).toBe(SINGLETON_PLACEMENT);
  expect(modalDefects([you, { ...you, trigger: { ...you.trigger } }])).toEqual([
    `duplicate id: ${you.id}`,
    `duplicate ${SINGLETON_PLACEMENT}: ${you.id} repeats ${you.id}`,
  ]);
  expect(modalDefects([you, { ...surfaceModal, trigger: { ...surfaceModal.trigger, placement: SINGLETON_PLACEMENT } }])).toEqual([
    `duplicate ${SINGLETON_PLACEMENT}: ${surfaceModal.id} repeats ${you.id}`,
  ]);
  expect(modalDefects([{ ...surfaceModal, body: { planned: "" } }])).toEqual([`empty planned reason: ${surfaceModal.id}`]);
  expect(modalDefects([surfaceModal])).toEqual([]);
  expect(modalDefects([{ ...surfaceModal, body: { planned: "build pending" } }])).toEqual([]);
});

test("every modal a modal home exports is assembled by the door", () => {
  expect(unassembledModals(homeExports, modals)).toEqual([]);
  expect(homeExports.filter(({ value }) => isModalDefinition(value)).length).toBe(modals.length);
});

test("unassembled modal defects: a home export the door never assembled is named, an assembled one is not", () => {
  const you = real("you");
  const stray: HomeExport = { file: "features/x/lib/x-modal.tsx", name: "xModal", value: { ...you } };
  expect(unassembledModals([{ file: "features/app-shell/lib/you-modal.tsx", name: "youModal", value: you }], modals)).toEqual([]);
  expect(unassembledModals([stray], modals)).toEqual(["unassembled modal: features/x/lib/x-modal.tsx exports xModal"]);
  expect(unassembledModals([{ ...stray, value: "not a definition" }], modals)).toEqual([]);
});
