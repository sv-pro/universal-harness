// Find a project manifest: a manifest path, a repo directory, a project id from the
// per-user index, or the repo containing the current directory. A manifest lives in
// its project's repo as .uh/project.yaml.
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome, loadProject, loadProjectIndex, loadProjectText, MANIFEST } from "./load.ts";
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
    const found = inRepo(resolve(arg));
    if (!found) throw new Error(`no project manifest: no ${MANIFEST} in ${arg}, nor on its default branch`);
    return found;
  }
  if (arg) {
    const known = knownProjects().find((p) => p.id === arg);
    if (!known) throw new Error(`no project '${arg}' in ${INDEX} (known: ${ids()})`);
    const found = inRepo(known.path);
    if (!found) throw new Error(`no project manifest: no ${MANIFEST} in ${known.path}, nor on its default branch (project '${arg}')`);
    return found;
  }
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const found = inRepo(dir);
    if (found) return found;
    if (dirname(dir) === dir) break;
  }
  throw new Error(`no project manifest: no ${MANIFEST} in ${resolve(cwd)} or above; pass -p <id|dir|manifest> (known: ${ids()})`);
}

/** The manifest in `dir`'s checkout, or, if this checkout lacks it (a branch cut before the
 *  manifest existed), the one on the default branch: it describes the project, not a branch. */
function inRepo(dir: string): { file: string; project: Project } | undefined {
  const file = join(dir, MANIFEST);
  if (existsSync(file)) return { file, project: loadProject(file) };
  if (!existsSync(join(dir, ".git"))) return undefined;
  for (const ref of ["origin/HEAD", "origin/main", "main", "origin/master", "master"]) {
    try {
      const text = execFileSync("git", ["-C", dir, "show", `${ref}:.uh/project.yaml`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return { file: `${ref}:.uh/project.yaml`, project: loadProjectText(text, `${dir} ${ref}:.uh/project.yaml`, dir) };
    } catch {
      // not on this ref
    }
  }
  return undefined;
}

const ids = () => knownProjects().map((p) => p.id).join(", ") || "none";
