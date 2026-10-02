import { readFileSync } from "node:fs";
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

export const loadProject = (file: string): Project => load(Project, file);
export const loadAgents = (file: string): AgentRegistry => load(AgentRegistry, file);
