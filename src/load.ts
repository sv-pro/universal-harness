import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import type { z } from "zod";
import { AgentRegistry, Project } from "./schema.ts";

export class LoadError extends Error {}

function load<S extends z.ZodType>(schema: S, file: string): z.infer<S> {
  const raw: unknown = parse(readFileSync(file, "utf8"));
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new LoadError(`${file}:\n${issues}`);
  }
  return result.data;
}

/** Repo paths may start with `~/`: a manifest is shared, a home directory is not. */
export function loadProject(file: string): Project {
  const p = load(Project, file);
  const path = p.project.repo.path;
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) p.project.repo.path = join(homedir(), path.slice(1));
  return p;
}
export const loadAgents = (file: string): AgentRegistry => load(AgentRegistry, file);
