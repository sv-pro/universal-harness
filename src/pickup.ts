// uh pickup: everything an agent needs to continue one item of work, assembled
// from all of the item's carriers and continuity records. Provider-neutral: it
// works on carriers, flows and keys; providers do the reading.
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { merge, seedKeys, slugMatches, type Keys } from "./identity.ts";
import { currentBranch, readAtBranch } from "./providers/git.ts";
import { filesProvider } from "./providers/files.ts";
import { gitProvider } from "./providers/git.ts";
import { githubProvider } from "./providers/github.ts";
import { linearProvider } from "./providers/linear.ts";
import type { Candidate, Ctx, Provider, Reading, Section } from "./providers/types.ts";
import type { AgentRegistry, Carrier, Project } from "./schema.ts";

export const PROVIDERS: Provider[] = [gitProvider, githubProvider, linearProvider, filesProvider];

export type CarrierReading = { carrier: Carrier; role: "primary" | "mirror"; reading: Reading | { status: "no-reader" }; states: string[] | null };

export type FlowStatus = {
  flow: string;
  states: string[]; // inferred current state(s); empty = unknown
  basis: "primary" | "mirrors" | "none";
  readings: CarrierReading[];
  disagreements: string[];
  next: { from: string; to: string; by: string; actor: string; agents: string[]; checks: string[]; effects: string[] }[];
};

export type Record_ = { level: string; location: string; reachable_by: string[]; found: { from: string; text: string }[] };

export type PickupReport = {
  project: string;
  ref: string;
  agent?: string;
  keys: Keys;
  lastAgent?: string;
  notes: string[];
  candidates: Candidate[];
  flows: FlowStatus[];
  sections: Section[];
  records: Record_[];
  gaps: string[];
};

export type PickupOptions = { ref?: string; agent?: string; fetch?: boolean; providers?: Provider[] };

export async function pickup(project: Project, registry: AgentRegistry, base: Pick<Ctx, "exec" | "fetch" | "env">, opts: PickupOptions = {}): Promise<PickupReport> {
  const providers = opts.providers ?? PROVIDERS;
  const repo = project.project.repo.path;
  const ctx: Ctx = {
    ...base,
    repo,
    project,
    registry,
    valuesOf: (id) => [...new Set(project.flows.flatMap((f) => f.states.map((s) => s.values[id]).filter((v): v is string => !!v)))],
    readFile: (path, keys, branchOnly = false) => {
      if (branchOnly && !keys.branch) return undefined; // never attribute another branch's file to this item
      const atBranch = readAtBranch(ctx, path, keys.branch);
      if (atBranch !== undefined) return atBranch ?? undefined;
      const full = join(repo, path);
      return existsSync(full) ? { text: readFileSync(full, "utf8"), from: `${path} (working tree)` } : undefined;
    },
  };

  const notes: string[] = [];
  if (opts.fetch !== false && ctx.exec("git", ["remote"]).out.trim()) {
    const f = ctx.exec("git", ["fetch", "--quiet", "--prune", "origin"]);
    if (!f.ok) notes.push(`git fetch failed (${f.err.split("\n")[0]}); remote state may be stale.`);
  }

  // 1. identity: seed from the ref (or the checked-out branch), then let providers add keys
  const ref = opts.ref ?? currentBranch(ctx) ?? "";
  const keys: Keys = ref ? seedKeys(project.identity, ref) : {};
  const candidates: Candidate[] = [];
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (const p of providers) {
      const r = (await p.resolve?.(keys, ctx)) ?? {};
      for (const k of r.drop ?? []) {
        if (keys[k] === undefined) continue;
        delete keys[k];
        changed = true;
      }
      changed = merge(keys, r.keys) || changed;
      for (const n of r.notes ?? []) if (!notes.includes(n)) notes.push(n);
      for (const c of r.candidates ?? []) if (!candidates.some((x) => x.label === c.label)) candidates.push(c);
    }
    if (!changed) break;
  }

  // 2. carriers → flow state
  const resources = new Map(project.resources.map((r) => [r.id, r]));
  const carriers = new Map(project.carriers.map((c) => [c.id, c]));
  const cache = new Map<string, CarrierReading["reading"]>();
  const unkeyed = new Set<string>();
  const readCarrier = async (c: Carrier) => {
    if (!c.key) {
      unkeyed.add(c.id); // cannot locate an item: not read, summarized once under gaps
      return { status: "no-reader" } as const;
    }
    if (!cache.has(c.id)) {
      const p = providers.find((x) => x.reads(c, c.resource ? resources.get(c.resource) : undefined));
      cache.set(c.id, p ? await p.read(c, keys, ctx) : { status: "no-reader" });
    }
    return cache.get(c.id)!;
  };

  const flows: FlowStatus[] = [];
  for (const f of project.flows) {
    const readings: CarrierReading[] = [];
    const ids = [{ id: f.carriers.primary, role: "primary" as const }, ...f.carriers.mirrors.map((m) => ({ id: m.carrier, role: "mirror" as const }))];
    for (const { id, role } of ids) {
      const c = carriers.get(id);
      if (!c) continue;
      const reading = await readCarrier(c);
      const mapped = f.states.some((s) => s.values[id] !== undefined);
      const states = reading.status === "found" && mapped ? f.states.filter((s) => same(s.values[id], reading.value)).map((s) => s.id) : null;
      readings.push({ carrier: c, role, reading, states });
    }
    const informative = readings.filter((r) => r.states !== null);
    if (!informative.length) continue; // the item is not in this flow, as far as we can see

    const primary = informative.find((r) => r.role === "primary");
    let states: string[];
    let basis: FlowStatus["basis"];
    if (primary?.states?.length) {
      states = primary.states;
      basis = "primary";
    } else {
      states = intersect(informative.filter((r) => r.role === "mirror").map((r) => r.states!));
      basis = states.length ? "mirrors" : "none";
    }
    const disagreements = informative
      .filter((r) => r.states!.length && states.length && !r.states!.some((s) => states.includes(s)))
      .map((r) => `${r.carrier.id} says ${(r.reading as { value: string }).value} (${r.states!.join("/")}), but the item is ${states.join("/")}`);
    for (const r of informative) {
      if (!r.states!.length) disagreements.push(`${r.carrier.id} value '${(r.reading as { value: string }).value}' matches no state of ${f.id}`);
    }

    const roles = new Map(project.roles.map((r) => [r.id, r]));
    const next = f.transitions
      .filter((t) => (Array.isArray(t.from) ? t.from : [t.from]).some((s) => states.includes(s)))
      .map((t) => {
        const role = roles.get(t.by);
        return {
          from: (Array.isArray(t.from) ? t.from : [t.from]).filter((s) => states.includes(s)).join(", "),
          to: t.to,
          by: t.by,
          actor: role?.actor ?? "agent",
          agents: role?.agents ?? [],
          checks: t.checks,
          effects: t.effects,
        };
      });
    flows.push({ flow: f.id, states, basis, readings, disagreements, next });
  }

  // 3. context from providers (branch, PR, checks, ...)
  const sections: Section[] = [];
  for (const p of providers) sections.push(...((await p.context?.(keys, ctx)) ?? []));

  // 4. continuity records that are files
  const records: Record_[] = project.continuity.records.map((r) => {
    const found: Record_["found"] = [];
    const path = r.path;
    if (path) {
      if (path.includes("*") || path.includes("{slug}")) {
        // per-item files: found in the working tree by name
        const matches = keys.slug ? globSync(path.replaceAll("{slug}", "*"), { cwd: repo }) : [];
        for (const m of matches.filter((m) => !path.includes("{slug}") || slugMatches(keys.slug!, m))) {
          const rel = m.replaceAll("\\", "/");
          found.push({ from: `${rel} (working tree)`, text: readFileSync(join(repo, rel), "utf8") });
        }
      } else {
        const file = ctx.readFile(path, keys, true);
        if (file) found.push(file);
      }
    }
    return { level: r.level, location: r.location, reachable_by: r.reachable_by, found };
  });

  // 5. gaps: what could not be read, and why
  const gaps: string[] = [];
  for (const [id, r] of cache) {
    if (r.status === "unreadable") gaps.push(`${id}: ${r.reason}`);
    if (r.status === "no-reader") gaps.push(`${id}: no reader for carrier kind '${carriers.get(id)?.kind}'`);
  }
  if (unkeyed.size) gaps.push(`Not checked (no identity key in the manifest): ${[...unkeyed].join(", ")}`);
  if (!keys.branch && !keys.pr && !keys.slug) gaps.push("No branch, PR or slug found for this item: nothing to continue from.");

  return {
    project: project.project.id,
    ref,
    ...(opts.agent ? { agent: opts.agent } : {}),
    keys,
    ...(keys.agent ? { lastAgent: keys.agent } : {}),
    notes,
    candidates,
    flows,
    sections,
    records,
    gaps,
  };
}

const same = (a: string | undefined, b: string) => a !== undefined && a.replaceAll("\\", "/").toLowerCase() === b.replaceAll("\\", "/").toLowerCase();

function intersect(sets: string[][]): string[] {
  const nonEmpty = sets.filter((s) => s.length);
  if (!nonEmpty.length) return [];
  return nonEmpty.reduce((acc, s) => acc.filter((x) => s.includes(x)));
}
