// @instrument-proof: the real Snap CLI drives picker and DataTransfer file feeders and reports the
// selected file identity/tree; a missing feeder, wrong target, or illegal directory shape reddens.
// @instrument-absence-proof: a selector that emits no filechooser and a path outside the fixture
// boundary both refuse loudly instead of producing a clean zero-file receipt.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

vi.setConfig({ testTimeout: scaledBudget(90_000), hookTimeout: scaledBudget(90_000) });

const FILE_ACTION_PAGE = `<!doctype html>
<html data-app-ready>
  <body>
    <section id="wrapped-picker">
      <input id="plain" type="file" multiple>
    </section>
    <button id="folder-trigger" type="button">Import a folder…</button>
    <input id="folder-input" type="file" hidden multiple webkitdirectory directory>
    <button id="dead-trigger" type="button">Does not choose</button>
    <div id="dropzone">Drop a backup</div>
    <output id="preflight"></output>
    <script>
      const preflight = document.querySelector('#preflight');
      const publish = (kind, files) => {
        const rows = Array.from(files).map((file) => file.webkitRelativePath || file.name).sort();
        preflight.dataset.kind = kind;
        preflight.dataset.count = String(rows.length);
        preflight.dataset.tree = rows.join('|');
        preflight.textContent = kind + ':' + String(rows.length) + ':' + rows.join('|');
      };
      document.querySelector('#plain').addEventListener('change', (event) => publish('picker', event.target.files));
      const folderInput = document.querySelector('#folder-input');
      document.querySelector('#folder-trigger').addEventListener('click', () => folderInput.click());
      folderInput.addEventListener('change', (event) => publish('folder', event.target.files));
      const dropzone = document.querySelector('#dropzone');
      dropzone.addEventListener('dragenter', (event) => event.preventDefault());
      dropzone.addEventListener('dragover', (event) => event.preventDefault());
      dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        publish('drop', event.dataTransfer.files);
      });
    </script>
  </body>
</html>`;

const BASE_ARGS = ["--no-shot", "--no-failure-evidence"] as const;

interface RunIndexProjection {
  readonly resultPairs: readonly (readonly [string, string])[];
  readonly artifacts: readonly { readonly path: string; readonly channel: string }[];
}

function runIndex(stdout: string): RunIndexProjection {
  const path = /RESULT snap exit=\d+ index=(\S+)/u.exec(stdout)?.[1];
  if (path === undefined) {
    throw new Error(`Snap output did not publish a run index:\n${stdout}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as RunIndexProjection;
}

test("--upload reaches direct/descendant inputs and prints the selected file identity", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "page.html": FILE_ACTION_PAGE, "fixture.txt": "plain picker" });
  const result = await runCli(
    "snap",
    ["--file", join(root, "page.html"), "--upload", `#wrapped-picker=${join(root, "fixture.txt")}`, "--wait-for", '#preflight[data-count="1"]', ...BASE_ARGS],
    { timeoutMs: scaledBudget(30_000) },
  );

  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("FILE ACTION");
  expect(result.stdout).toContain("fixture.txt");
  expect(result.stdout).toContain("files=1");
  const index = runIndex(result.stdout);
  expect(index.resultPairs).toEqual(
    expect.arrayContaining([
      ["file-actions", "1"],
      ["files-driven", "1"],
    ]),
  );
  const corePath = index.artifacts.find((artifact) => artifact.channel === "core-capture")?.path;
  expect(corePath).toBeDefined();
  const core = JSON.parse(readFileSync(corePath ?? "", "utf8")) as { readonly captures: readonly { readonly fileActions: readonly unknown[] }[] };
  expect(core.captures[0]?.fileActions).toEqual([
    expect.objectContaining({ kind: "upload", feeder: "input", files: 1, identities: [expect.objectContaining({ relativePath: "fixture.txt" })] }),
  ]);
});

test("--upload clicks the production FolderPicker DOM shape and preserves a directory tree", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    "page.html": FILE_ACTION_PAGE,
    "tree/root.json": "root",
    "tree/nested/card.png": "nested",
  });
  const result = await runCli(
    "snap",
    [
      "--file",
      join(root, "page.html"),
      "--upload",
      `#folder-trigger=${join(root, "tree")}`,
      "--wait-for",
      '#preflight[data-kind="folder"][data-count="2"]',
      "--expect-text",
      "#preflight=folder:2:tree/nested/card.png|tree/root.json",
      ...BASE_ARGS,
    ],
    { timeoutMs: scaledBudget(30_000) },
  );

  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("feeder=filechooser");
  expect(result.stdout).toContain("files=2");
  expect(result.stdout).toContain("tree/nested/card.png");
});

test("--drop-files dispatches a real DataTransfer sequence and stages every file", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "page.html": FILE_ACTION_PAGE, "a.png": "PNG", "b.json": "{}" });
  const result = await runCli(
    "snap",
    [
      "--file",
      join(root, "page.html"),
      "--drop-files",
      `#dropzone=${join(root, "a.png")},${join(root, "b.json")}`,
      "--wait-for",
      '#preflight[data-kind="drop"][data-count="2"]',
      "--expect-text",
      "#preflight=drop:2:a.png|b.json",
      ...BASE_ARGS,
    ],
    { timeoutMs: scaledBudget(30_000) },
  );

  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("kind=drop-files");
  expect(result.stdout).toContain("feeder=datatransfer");
  expect(result.stdout).toContain("files=2");
});

test("file actions refuse boundary escapes and selectors that emit no chooser", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "page.html": FILE_ACTION_PAGE, "fixture.txt": "plain picker" });
  const outside = await runCli("snap", ["--file", join(root, "page.html"), "--upload", "#plain=/etc/hostname", ...BASE_ARGS], {
    timeoutMs: scaledBudget(30_000),
  });
  const noChooser = await runCli("snap", ["--file", join(root, "page.html"), "--upload", `#dead-trigger=${join(root, "fixture.txt")}`, ...BASE_ARGS], {
    timeoutMs: scaledBudget(30_000),
  });

  await expect(outside).toExitWith(1);
  expect(outside.stdout).toContain("outside the repo/scratchpad boundary");
  await expect(noChooser).toExitWith(1);
  expect(noChooser.stdout).toContain("did not emit a filechooser");
});

test("file actions refuse wrong targets and mismatched directory semantics", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "page.html": FILE_ACTION_PAGE, "fixture.txt": "plain picker", "tree/nested.txt": "nested" });
  const directoryToFile = await runCli("snap", ["--file", join(root, "page.html"), "--upload", `#plain=${join(root, "tree")}`, ...BASE_ARGS], {
    timeoutMs: scaledBudget(30_000),
  });
  const fileToDirectory = await runCli("snap", ["--file", join(root, "page.html"), "--upload", `#folder-trigger=${join(root, "fixture.txt")}`, ...BASE_ARGS], {
    timeoutMs: scaledBudget(30_000),
  });
  const directoryDrop = await runCli("snap", ["--file", join(root, "page.html"), "--drop-files", `#dropzone=${join(root, "tree")}`, ...BASE_ARGS], {
    timeoutMs: scaledBudget(30_000),
  });
  const missingTarget = await runCli("snap", ["--file", join(root, "page.html"), "--drop-files", `#missing=${join(root, "fixture.txt")}`, ...BASE_ARGS], {
    timeoutMs: scaledBudget(30_000),
  });

  await expect(directoryToFile).toExitWith(1);
  expect(directoryToFile.stdout).toContain("directory path requires a webkitdirectory target");
  await expect(fileToDirectory).toExitWith(1);
  expect(fileToDirectory.stdout).toContain("webkitdirectory target requires exactly one directory path");
  await expect(directoryDrop).toExitWith(1);
  expect(directoryDrop.stdout).toContain("--drop-files accepts regular files, not directories");
  await expect(missingTarget).toExitWith(1);
  expect(missingTarget.stdout).toContain("waiting for locator('#missing').first()");
});

test("chooser/drop synonym spellings are refused before a browser boots", async ({ runCli }) => {
  for (const flag of ["--choose-files", "--pick-files", "--upload-directory", "--file-dialog", "--native-dialog"]) {
    const result = await runCli("snap", [flag, "#target=/tmp/a"]);
    await expect(result).toExitWith(3);
    expect(result.stdout).toContain(`unknown flag ${flag}`);
  }
});
