import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import type { z } from "zod";
import { AgentRegistry, Project, ProjectIndex } from "./schema.ts";

export class LoadError extends Error {}

function load<S extends z.ZodType>(schema: S, file: string, text = readFileSync(file, "utf8")): z.infer<S> {
  const raw: unknown = parse(text);
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new LoadError(`${file}:\n${issues}`);
  }
  return result.data;
}

export const MANIFEST = join(".uh", "project.yaml");

/** A manifest lives in its project's repo (<repo>/.uh/project.yaml), which is then the
 *  repo path. Elsewhere (a test fixture) it must say `repo.path`, which may start with ~/. */
export function loadProject(file: string): Project {
  const p = load(Project, file);
  p.project.repo.path = expandHome(p.project.repo.path) || repoOf(file) || "";
  if (!p.project.repo.path) throw new LoadError(`${file}: not in <repo>/.uh/, so project.repo.path is required`);
  return p;
}

/** A manifest read from somewhere other than its file (e.g. `git show main:.uh/project.yaml`). */
export function loadProjectText(text: string, source: string, repoPath: string): Project {
  const p = load(Project, source, text);
  p.project.repo.path = expandHome(p.project.repo.path) || repoPath;
  return p;
}

const repoOf = (file: string) => {
  const dir = dirname(resolve(file));
  return basename(dir) === ".uh" ? dirname(dir) : undefined;
};

export const expandHome = (path: string) =>
  path === "~" || path.startsWith("~/") || path.startsWith("~\\") ? join(homedir(), path.slice(1)) : path;

export const loadProjectIndex = (file: string): ProjectIndex => load(ProjectIndex, file);
export const loadAgents = (file: string): AgentRegistry => load(AgentRegistry, file);
