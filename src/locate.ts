// Find a project manifest: a manifest path, a repo directory, a project id from the
// per-user index, or the repo containing the current directory. A manifest lives in
// its project's repo as .uh/project.yaml.
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome, loadProject, loadProjectIndex, MANIFEST } from "./load.ts";
import type { Project } from "./schema.ts";

export const HOME = join(dirname(fileURLToPath(import.meta.url)), "..");
export const INDEX = join(HOME, "registry", "projects.yaml");

export function knownProjects(): { id: string; path: string }[] {
  return existsSync(INDEX) ? loadProjectIndex(INDEX).projects.map((p) => ({ id: p.id, path: expandHome(p.path) })) : [];
}

export function locate(arg: string | undefined, cwd: string): { file: string; project: Project } {
  const at = (file: string) => ({ file, project: loadProject(file) });
  if (arg && /\.ya?ml$/.test(arg)) return at(arg);
  if (arg && existsSync(arg) && statSync(arg).isDirectory()) {
    const file = join(arg, MANIFEST);
    if (!existsSync(file)) throw new Error(`no project manifest: ${file} does not exist`);
    return at(file);
  }
  if (arg) {
    const known = knownProjects().find((p) => p.id === arg);
    if (!known) throw new Error(`no project '${arg}' in ${INDEX} (known: ${ids()})`);
    const file = join(known.path, MANIFEST);
    if (!existsSync(file)) throw new Error(`no project manifest: ${file} does not exist (project '${arg}')`);
    return at(file);
  }
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const file = join(dir, MANIFEST);
    if (existsSync(file)) return at(file);
    if (dirname(dir) === dir) break;
  }
  throw new Error(`no project manifest: no ${MANIFEST} in ${resolve(cwd)} or above; pass -p <id|dir|manifest> (known: ${ids()})`);
}

const ids = () => knownProjects().map((p) => p.id).join(", ") || "none";
