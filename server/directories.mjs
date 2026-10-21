/**
 * The bridge-only `dashboard.fs.list` helper: directory names only, never file
 * contents. It exists so the spawn cwd picker does not need a second service.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export function directoryRoots() {
  if (process.platform !== "win32") return ["/"];
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .map((letter) => `${letter}:\\`)
    .filter((path) => existsSync(path));
}

export function listDirectories(rawPath) {
  const requested =
    typeof rawPath === "string" && rawPath.trim() ? rawPath.trim() : homedir();
  const path = resolve(requested);
  try {
    if (!statSync(path).isDirectory()) {
      throw new Error("not a directory");
    }
    const entries = readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
      }))
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
      );
    const parent = dirname(path);
    return {
      path,
      parent: parent === path ? null : parent,
      entries,
      roots: directoryRoots(),
    };
  } catch (error) {
    throw {
      code: "bad_request",
      message: `Cannot browse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
