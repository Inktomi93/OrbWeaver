// Every built client feature slice follows the slice layout, and every feature directory owns a registered definition.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const REPOSITORY = join(import.meta.dirname, "../..");
const FEATURES = "packages/client/src/features";
const DOMAINS = "packages/server/src/domain";
const NON_AUTHORED = new Set(["node_modules", ".git", "dist", ".cache"]);

interface Entry {
  readonly path: string;
  readonly kind: "file" | "directory";
}

/** Every authored entry beneath a repository-relative directory, at any depth. */
function listTree(directory: string): readonly Entry[] {
  const root = join(REPOSITORY, directory);
  return readdirSync(root, { recursive: true, withFileTypes: true }).flatMap((dirent) => {
    const absolute = join(dirent.parentPath, dirent.name);
    return relative(root, absolute)
      .split("/")
      .some((segment) => NON_AUTHORED.has(segment))
      ? []
      : [{ path: relative(REPOSITORY, absolute), kind: dirent.isDirectory() ? ("directory" as const) : ("file" as const) }];
  });
}

/** A tree from a file map: each file plus every directory above it, the way a checkout lists. */
function treeOf(files: Readonly<Record<string, string>>): readonly Entry[] {
  const entries = new Map<string, Entry>();
  for (const path of Object.keys(files)) {
    entries.set(path, { path, kind: "file" });
    const segments = path.split("/");
    for (let depth = 1; depth < segments.length; depth += 1) {
      const directory = segments.slice(0, depth).join("/");
      entries.set(directory, { path: directory, kind: "directory" });
    }
  }
  return [...entries.values()];
}

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

function directChildren(entries: readonly Entry[], directory: string): readonly Entry[] {
  const prefix = `${directory}/`;
  return entries.filter((entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes("/"));
}

function descendants(entries: readonly Entry[], directory: string): readonly Entry[] {
  return entries.filter((entry) => entry.path.startsWith(`${directory}/`));
}

const directoryNames = (entries: readonly Entry[], directory: string): readonly string[] =>
  directChildren(entries, directory)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => basename(entry.path))
    .toSorted();

// ── the slice layout ─────────────────────────────────────────────────────────────────────────────────────────

/** A feature module lives in a bucket, never at the slice root. */
const BUCKETS = new Set(["surfaces", "anchors", "components", "hooks", "lib"]);
/** app-shell is the shell frame: it also owns the slot registries and the shell store. */
const SHELL_EXTRA = new Set(["registry", "store"]);
/** Slices that own no server domain by design: the shell frame and UI-only slices. */
const RESERVED = new Set(["app-shell", "auth", "config", "home", "refinery", "regex", "user-admin"]);
/** An anchor names the containment it provides. */
const ANCHOR_SUFFIXES = ["anchor", "dialog", "drawer", "popover", "menu", "panel"];
/** The bare modal root only. A surface may compose `<DialogTrigger>` or `<ConfirmDialog>` but never render the outer container. */
const OUTER_CONTAINER = /<(?:Dialog|AlertDialog|Drawer)[\s/>]/u;
const CODE = /\.tsx?$/u;
const ROOT_OK = /^(?:index\.ts|.*\.md|\.gitkeep)$/u;

/** Bucket-relative paths at any depth: a bucket may group its modules into sub-directories. */
const bucketPaths = (entries: readonly Entry[], feature: string, bucket: string, kind: Entry["kind"]): readonly string[] =>
  descendants(entries, `${FEATURES}/${feature}/${bucket}`)
    .filter((entry) => entry.kind === kind)
    .map((entry) => entry.path.slice(`${FEATURES}/${feature}/${bucket}/`.length));

function hookNameOk(file: string): boolean {
  if (file.endsWith(".tsx")) {
    return file.startsWith("use-") || file.endsWith("-context.tsx") || file.endsWith("-provider.tsx");
  }
  return file.startsWith("use-");
}

/** The slice's root files and directories: front door, mirror invariant, known buckets, no stray root files. */
function rootProblems(entries: readonly Entry[], feature: string, domains: ReadonlySet<string>): readonly string[] {
  const root = `${FEATURES}/${feature}`;
  const children = directChildren(entries, root);
  const allowed = feature === "app-shell" ? new Set([...BUCKETS, ...SHELL_EXTRA]) : BUCKETS;
  return [
    ...(children.some((entry) => entry.kind === "file" && basename(entry.path) === "index.ts") ? [] : [`front-door: ${root}`]),
    ...(RESERVED.has(feature) || domains.has(feature) ? [] : [`mirror: ${root}`]),
    ...children.filter((entry) => entry.kind === "directory" && !allowed.has(basename(entry.path))).map((entry) => `bucket: ${entry.path}`),
    ...children.filter((entry) => entry.kind === "file" && !ROOT_OK.test(basename(entry.path))).map((entry) => `stray-root: ${entry.path}`),
  ];
}

/** Surface naming (app-shell is exempt: its surfaces are frame chrome) and surface purity, at any depth. */
function surfaceProblems(entries: readonly Entry[], feature: string, readText: (path: string) => string): readonly string[] {
  return bucketPaths(entries, feature, "surfaces", "file")
    .filter((file) => file.endsWith(".tsx"))
    .flatMap((file) => {
      const path = `${FEATURES}/${feature}/surfaces/${file}`;
      return [
        ...(feature === "app-shell" || basename(file).endsWith("-surface.tsx") ? [] : [`surface-name: ${path}`]),
        ...(OUTER_CONTAINER.test(readText(path)) ? [`surface-purity: ${path}`] : []),
      ];
    });
}

function hookAndAnchorProblems(entries: readonly Entry[], feature: string): readonly string[] {
  const root = `${FEATURES}/${feature}`;
  const anchorSuffix = (file: string): string => {
    const base = basename(file).replace(/\.tsx$/u, "");
    return base.slice(base.lastIndexOf("-") + 1);
  };
  return [
    ...bucketPaths(entries, feature, "hooks", "file")
      .filter((file) => CODE.test(file) && !hookNameOk(basename(file)))
      .map((file) => `hook-name: ${root}/hooks/${file}`),
    ...bucketPaths(entries, feature, "anchors", "file")
      .filter((file) => file.endsWith(".tsx") && !ANCHOR_SUFFIXES.includes(anchorSuffix(file)))
      .map((file) => `anchor-name: ${root}/anchors/${file}`),
  ];
}

/** Bucket nesting is grouping only: a slice has one set of buckets, at its root. */
function groupAxisProblems(entries: readonly Entry[], feature: string): readonly string[] {
  const axis = new Set([...BUCKETS, ...SHELL_EXTRA]);
  return [...axis].flatMap((bucket) =>
    bucketPaths(entries, feature, bucket, "directory")
      .filter((group) => axis.has(basename(group)))
      .map((group) => `group-axis: ${FEATURES}/${feature}/${bucket}/${group}`),
  );
}

/** Violations of every built feature, as `rule: path`. A feature is built once it holds any .ts or .tsx. */
function sliceProblems(entries: readonly Entry[], readText: (path: string) => string): readonly string[] {
  const domains = new Set(directoryNames(entries, DOMAINS));
  return directoryNames(entries, FEATURES)
    .filter((feature) => descendants(entries, `${FEATURES}/${feature}`).some((entry) => entry.kind === "file" && CODE.test(entry.path)))
    .flatMap((feature) => [
      ...rootProblems(entries, feature, domains),
      ...surfaceProblems(entries, feature, readText),
      ...hookAndAnchorProblems(entries, feature),
      ...groupAxisProblems(entries, feature),
    ])
    .toSorted();
}

const domainIndex = (domain: string): Record<string, string> => ({ [`${DOMAINS}/${domain}/index.ts`]: "export const d = 1;\n" });
const featureIndex = (feature: string): Record<string, string> => ({ [`${FEATURES}/${feature}/index.ts`]: "export const x = 1;\n" });
const inFeature = (feature: string, files: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, text]) => [`${FEATURES}/${feature}/${path}`, text]));
const COMPONENT = "export const C = () => null;\n";

function slice(files: Readonly<Record<string, string>>): readonly string[] {
  return sliceProblems(treeOf(files), (path) => files[path] ?? "");
}

function realSliceProblems(): readonly string[] {
  const entries = [...listTree(FEATURES), ...listTree(DOMAINS)];
  return sliceProblems(entries, (path) => readFileSync(join(REPOSITORY, path), "utf8"));
}

test("every built real feature slice follows the layout", () => {
  expect(directoryNames(listTree(FEATURES), FEATURES)).toContain("chat");
  expect(realSliceProblems()).toEqual([]);
});

test("a built feature with a stray root file and no front door, and an unmirrored name, are reported", () => {
  expect(
    slice({
      [`${FEATURES}/broken/stray.ts`]: "export const x = 1;\n",
      ...domainIndex("companion"),
      ...featureIndex("user-admin"),
      [`${FEATURES}/user-admin/surfaces/keep-surface.tsx`]: COMPONENT,
    }),
  ).toEqual([`front-door: ${FEATURES}/broken`, `mirror: ${FEATURES}/broken`, `stray-root: ${FEATURES}/broken/stray.ts`]);
});

test("a built feature that is neither reserved nor a real domain mirror is reported", () => {
  expect(
    slice({
      ...featureIndex("nodomain"),
      ...domainIndex("companion"),
      ...featureIndex("user-admin"),
      [`${FEATURES}/user-admin/surfaces/keep-surface.tsx`]: COMPONENT,
    }),
  ).toEqual([`mirror: ${FEATURES}/nodomain`]);
});

test("a surface file not ending in -surface.tsx is reported", () => {
  expect(slice({ ...domainIndex("character"), ...featureIndex("character"), ...inFeature("character", { "surfaces/card.tsx": COMPONENT }) })).toEqual([
    `surface-name: ${FEATURES}/character/surfaces/card.tsx`,
  ]);
});

test("a hooks file not named use-* is reported", () => {
  expect(
    slice({
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "hooks/helpers.ts": "export const h = 1;\n", "surfaces/card-surface.tsx": COMPONENT }),
    }),
  ).toEqual([`hook-name: ${FEATURES}/character/hooks/helpers.ts`]);
});

test("an anchor without a container-type suffix is reported", () => {
  expect(
    slice({
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "anchors/thing.tsx": COMPONENT, "surfaces/card-surface.tsx": COMPONENT }),
    }),
  ).toEqual([`anchor-name: ${FEATURES}/character/anchors/thing.tsx`]);
});

test("a surface rendering its own outer Dialog root is reported", () => {
  expect(
    slice({
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "surfaces/edit-surface.tsx": "export const E = () => <Dialog>x</Dialog>;\n" }),
    }),
  ).toEqual([`surface-purity: ${FEATURES}/character/surfaces/edit-surface.tsx`]);
});

test("a surface in a bucket group dir keeps both its naming and purity contracts", () => {
  expect(
    slice({
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "surfaces/gallery/card.tsx": "export const C = () => <Drawer>x</Drawer>;\n" }),
    }),
  ).toEqual([`surface-name: ${FEATURES}/character/surfaces/gallery/card.tsx`, `surface-purity: ${FEATURES}/character/surfaces/gallery/card.tsx`]);
});

test("a hooks file in a bucket group dir keeps the use-* contract", () => {
  expect(
    slice({
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "hooks/editor/helpers.ts": "export const h = 1;\n", "surfaces/card-surface.tsx": COMPONENT }),
    }),
  ).toEqual([`hook-name: ${FEATURES}/character/hooks/editor/helpers.ts`]);
});

test("a group dir named after a bucket re-declares the bucket axis", () => {
  expect(
    slice({
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "components/hooks/use-card.ts": "export const useCard = () => 1;\n", "surfaces/card-surface.tsx": COMPONENT }),
    }),
  ).toEqual([`group-axis: ${FEATURES}/character/components/hooks`]);
});

test("layouts the slice contract allows report nothing", () => {
  const useHook = "export const useChat = () => 1;\n";
  const legal: readonly Record<string, string>[] = [
    {
      ...domainIndex("chat"),
      ...inFeature("chat", { "index.ts": "export const i = 1;\n", "surfaces/chat-surface.tsx": COMPONENT, "hooks/use-chat.ts": useHook }),
    },
    { ...featureIndex("user-admin"), ...inFeature("user-admin", { "surfaces/keep-surface.tsx": COMPONENT }), ...domainIndex("companion") },
    { ...featureIndex("app-shell"), ...inFeature("app-shell", { "surfaces/rail.tsx": COMPONENT }), ...domainIndex("companion") },
    {
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "surfaces/edit-surface.tsx": "export const E = () => <DialogTrigger>x</DialogTrigger>;\n" }),
    },
    {
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "hooks/use-card.ts": useHook, "hooks/.gitkeep": "", "surfaces/card-surface.tsx": COMPONENT }),
    },
    {
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", { "anchors/edit-dialog.tsx": COMPONENT, "surfaces/card-surface.tsx": COMPONENT }),
    },
    {
      ...domainIndex("character"),
      ...featureIndex("character"),
      ...inFeature("character", {
        "components/card/header.tsx": COMPONENT,
        "surfaces/gallery/browse-surface.tsx": COMPONENT,
        "hooks/editor/use-card.ts": useHook,
      }),
    },
  ];
  expect(legal.map(slice)).toEqual(legal.map(() => []));
});

// ── feature ownership of a definition ────────────────────────────────────────────────────────────────────────

const DEFINITION_SUFFIXES = ["-section", "-modal", "-group", "-chrome", "-mode"].flatMap((stem) => [`${stem}.ts`, `${stem}.tsx`]);

/** Feature directories with no `lib/*-{section,modal,group,chrome,mode}.{ts,tsx}` file. */
function unownedFeatures(entries: readonly Entry[]): readonly string[] {
  const owners = new Set(
    entries.flatMap((entry) => {
      const [feature, bucket, file, ...rest] = entry.path.startsWith(`${FEATURES}/`) ? entry.path.slice(FEATURES.length + 1).split("/") : [];
      return entry.kind === "file" && bucket === "lib" && file !== undefined && rest.length === 0 && DEFINITION_SUFFIXES.some((suffix) => file.endsWith(suffix))
        ? [feature]
        : [];
    }),
  );
  return directoryNames(entries, FEATURES).filter((feature) => !owners.has(feature));
}

test("every real feature directory owns a registered definition", () => {
  const entries = listTree(FEATURES);
  expect(directoryNames(entries, FEATURES)).toContain("chat");
  expect(unownedFeatures(entries)).toEqual([]);
});

test("a mode-named component outside lib does not make a feature own a definition", () => {
  expect(unownedFeatures(treeOf({ [`${FEATURES}/__g_modehelper/components/helper-mode.tsx`]: "export const g = 1;\n" }))).toEqual(["__g_modehelper"]);
});

test("a feature with only a non-definition lib file owns nothing", () => {
  expect(unownedFeatures(treeOf({ [`${FEATURES}/__g_orphan/lib/helper.ts`]: "export const g = 1;\n" }))).toEqual(["__g_orphan"]);
});

test("a lib file named for a mode, section, chrome or group definition makes the feature its owner", () => {
  const owned = ["labels-mode.tsx", "__g-ownssection-section.tsx", "__g-ownschrome-chrome.tsx", "__g-ownsgroup-group.tsx"].map((file) =>
    unownedFeatures(treeOf({ [`${FEATURES}/__g_owner/lib/${file}`]: "export const g = 1;\n" })),
  );
  expect(owned).toEqual([[], [], [], []]);
});
