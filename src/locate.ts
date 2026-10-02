// Find a project manifest from a path, a project id, or the current directory,
// so `uh pickup` works from inside any described repo.
import { existsSync, globSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject } from "./load.ts";
import type { Project } from "./schema.ts";

export const HOME = join(dirname(fileURLToPath(import.meta.url)), "..");

export function manifests(): string[] {
  return globSync("projects/*/project.yaml", { cwd: HOME }).map((f) => join(HOME, f));
}

/** `arg` may be a manifest path or a project id; without it, the project whose repo contains `cwd`. */
export function locate(arg: string | undefined, cwd: string): { file: string; project: Project } {
  if (arg && (arg.endsWith(".yaml") || arg.endsWith(".yml"))) return { file: arg, project: loadProject(arg) };
  if (arg) {
    const file = join(HOME, "projects", arg, "project.yaml");
    if (!existsSync(file)) throw new Error(`no project '${arg}' (known: ${ids().join(", ")})`);
    return { file, project: loadProject(file) };
  }
  const here = resolve(cwd);
  let best: { file: string; project: Project; depth: number } | undefined;
  for (const file of manifests()) {
    const project = loadProject(file);
    const rel = relative(resolve(project.project.repo.path), here);
    const inside = rel === "" || (!rel.startsWith("..") && !rel.includes(":"));
    if (inside && (!best || rel.length < best.depth)) best = { file, project, depth: rel.length };
  }
  if (!best) throw new Error(`no project manifest covers ${here}; pass --project <id> (known: ${ids().join(", ")})`);
  return best;
}

const ids = () => manifests().map((f) => f.replaceAll("\\", "/").split("/").at(-2)!);
