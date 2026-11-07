// A staged directory read through a handle held since it opened, so a listed name stays bound to the directory listed.
// SECURITY: the actor is local and may rename inside a staged tree after a listing admits a name. O_NOFOLLOW guards only
// the final component, so a path read would follow a swapped parent to other bytes. Node has no openat; on Linux
// /proc/self/fd/<fd>/<name> resolves from the held directory itself, not its path, and a later swap redirects nothing.
// macOS and Windows expose no equivalent, so there the path stays the handle: leaf guards hold, a late parent swap does not.

import type { Dirent } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { errnoCode } from "#primitives/errno";

const HELD_PARENT_PLATFORM = "linux";
const HELD_FD_ROOT = "/proc/self/fd";
const CURRENT_DIR = ".";
const PARENT_DIR = "..";
/** A name that is not there, or that a file or link occupies: "this tree has no such directory". */
const ABSENT_DIR_CODES: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR"]);

export interface HeldDirectory extends AsyncDisposable {
  /** Lists this directory. */
  readonly location: string;
  /** Opens one child of this directory. */
  readonly child: (name: string) => string;
}

function isAbsent(error: unknown): boolean {
  return ABSENT_DIR_CODES.has(errnoCode(error) ?? "");
}

function heldAt(location: string, release: () => Promise<void>): HeldDirectory {
  return {
    location,
    child: (name): string => {
      // A climb or separator here would leave the held directory, so only one plain entry name passes.
      if (name === CURRENT_DIR || name === PARENT_DIR || name !== basename(name)) {
        throw new Error(`not a single directory entry: ${name}`);
      }
      return join(location, name);
    },
    [Symbol.asyncDispose]: release,
  };
}

async function openHeld(path: string, flags: number): Promise<HeldDirectory | null> {
  try {
    const handle = await open(path, flags);
    return heldAt(`${HELD_FD_ROOT}/${String(handle.fd)}`, () => handle.close());
  } catch (error) {
    if (isAbsent(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Hold the root of a staged tree, or null when nothing is there. Custody starts at this open. The root may be an
 * operator's link, so it follows one; a caller that needs a link-free staged root resolves it first.
 */
export async function holdTree(root: string): Promise<HeldDirectory | null> {
  if (process.platform === HELD_PARENT_PLATFORM) {
    // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API.
    return await openHeld(root, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
  }
  const found = await stat(root).catch((error: unknown) => {
    if (isAbsent(error)) {
      return null;
    }
    throw error;
  });
  return found?.isDirectory() === true ? heldAt(root, () => Promise.resolve()) : null;
}

/** Hold one child directory from its held parent, or null when it is missing or is a file or a link. */
export async function holdChild(parent: HeldDirectory, name: string): Promise<HeldDirectory | null> {
  const path = parent.child(name);
  if (process.platform === HELD_PARENT_PLATFORM) {
    // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API.
    return await openHeld(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
  }
  const found = await lstat(path).catch((error: unknown) => {
    if (isAbsent(error)) {
      return null;
    }
    throw error;
  });
  return found?.isDirectory() === true ? heldAt(path, () => Promise.resolve()) : null;
}

export function listHeld(held: HeldDirectory): Promise<Dirent[]> {
  return readdir(held.location, { withFileTypes: true });
}

/** Read one child, refusing a link at the leaf and closing the handle on every read outcome. */
export async function readHeldFile(held: HeldDirectory, name: string): Promise<Uint8Array> {
  // `await using`: node's `FileHandle` carries `[Symbol.asyncDispose]` (= `close()`), so the fd is closed on
  // every exit of this scope — and a close that throws while the READ also threw now surfaces as a
  // SuppressedError carrying BOTH, instead of the finally's close error masking the real fault.
  // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API.
  await using handle = await open(held.child(name), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  const data = await handle.readFile();
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** One child's size without following a link. */
export async function heldFileSize(held: HeldDirectory, name: string): Promise<number> {
  return (await lstat(held.child(name))).size;
}
