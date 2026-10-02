// Item identity: the keys that name one piece of work across carriers
// (e.g. linear=AI2-25, github=#87, pr=95, branch=cursor/doctor-fixtures-87-15e5).
import type { AgentRegistry, Identity } from "./schema.ts";

export type Keys = Record<string, string>;

/** Every identity key found in a text (first match per key). */
export function extractKeys(id: Identity, text: string): Keys {
  const out: Keys = {};
  for (const k of id.keys) {
    const m = new RegExp(k.pattern, "i").exec(text);
    if (m) out[k.id] = normalize(k.pattern, m[0]);
  }
  return out;
}

/** Interpret what the user typed: a key, a branch name, or a slug. */
export function seedKeys(id: Identity, ref: string): Keys {
  for (const candidate of [ref, `#${ref}`]) {
    for (const k of id.keys) {
      const m = new RegExp(`^(?:${k.pattern})$`, "i").exec(candidate);
      if (m) return { [k.id]: normalize(k.pattern, m[0]) };
    }
  }
  return ref.includes("/") ? { branch: ref } : { slug: ref };
}

/** Split `prefix/rest` and name the agent that pushes under that prefix. */
export function splitBranch(branch: string, reg: AgentRegistry): { slug: string; agent?: string; prefix?: string } {
  const i = branch.indexOf("/");
  if (i < 0) return { slug: branch };
  const prefix = branch.slice(0, i);
  const agent = reg.agents.find((a) => a.branch_prefixes.includes(prefix))?.id;
  return { slug: branch.slice(i + 1), prefix, ...(agent ? { agent } : {}) };
}

/** A file named after an item: the slug itself, or a prefix of it (branch slugs often
 *  carry a suffix: doctor-fixtures-87-15e5). */
export function slugMatches(slug: string, fileName: string): boolean {
  const name = fileName.slice(fileName.replaceAll("\\", "/").lastIndexOf("/") + 1).replace(/\.mdx?$/, "");
  return slug === name || slug.startsWith(`${name}-`);
}

/** Add keys without overwriting the ones already known. */
export function merge(into: Keys, from: Keys | undefined): boolean {
  let changed = false;
  for (const [k, v] of Object.entries(from ?? {})) {
    if (into[k] === undefined) {
      into[k] = v;
      changed = true;
    }
  }
  return changed;
}

// Keys are compared as written in the pattern's case (AI2-25, not ai2-25 from a branch name).
function normalize(pattern: string, value: string): string {
  const literal = /^[A-Za-z0-9]+/.exec(pattern)?.[0];
  return literal && literal === literal.toUpperCase() ? value.toUpperCase() : value;
}
