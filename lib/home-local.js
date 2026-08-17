// Vendored from @deepseek-ai/dsh-home-paths@0.1.0-rc.6 (MIT,
// deepseek-ai/deepseek-harness). Only `dshHomePath` is used by the bridge;
// vendored so the distributed bundle needs no node_modules at install time.
// Semantics mirror upstream exactly: $DSH_HOME (non-blank) wins, else ~/.dsh.

import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Environment variable that overrides the default DeepSeek Harness home. */
const DSH_HOME_ENV = "DSH_HOME";

/** Expand supported tilde prefixes against the operating-system home. */
function expandHomePath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

/** Join path segments onto the resolved DeepSeek Harness home. */
export function dshHomePath(...segments) {
  const fromEnv = process.env[DSH_HOME_ENV];
  const home = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), ".dsh");
  return join(resolve(expandHomePath(home)), ...segments);
}