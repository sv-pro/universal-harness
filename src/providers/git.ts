import { extractKeys, slugMatches, splitBranch, type Keys } from "../identity.ts";
import type { Ctx, Provider, Reading, Section } from "./types.ts";

const git = (ctx: Ctx, ...args: string[]) => ctx.exec("git", args);

export function currentBranch(ctx: Ctx): string | undefined {
  const r = git(ctx, "branch", "--show-current");
  return r.ok && r.out.trim() ? r.out.trim() : undefined;
}

export function defaultBranch(ctx: Ctx): string {
  const r = git(ctx, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  if (r.ok) return r.out.trim(); // origin/main
  for (const b of ["main", "master"]) if (git(ctx, "rev-parse", "--verify", "--quiet", b).ok) return b;
  return "main";
}

/** The ref holding a branch's latest known commit: local if it exists, else origin. */
export function branchRef(ctx: Ctx, branch: string): string | undefined {
  for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
    if (git(ctx, "rev-parse", "--verify", "--quiet", ref).ok) return ref;
  }
  return undefined;
}

export function readAtBranch(ctx: Ctx, path: string, branch: string | undefined) {
  if (!branch || branch === currentBranch(ctx)) return undefined; // caller reads the working tree
  // Prefer origin: a cloud agent's latest work exists only there.
  for (const ref of [`origin/${branch}`, branch]) {
    const r = git(ctx, "show", `${ref}:${path}`);
    if (r.ok) return { text: r.out, from: `${ref}:${path}` };
  }
  return null; // not on that branch
}

export const gitProvider: Provider = {
  id: "git",
  reads: (c) => c.kind === "branch",

  async read(_c, keys, ctx): Promise<Reading> {
    if (!keys.branch) return { status: "absent", detail: "no branch known" };
    const ref = branchRef(ctx, keys.branch);
    if (!ref) return { status: "absent", detail: `no branch ${keys.branch}` };
    // Merged = has commits of its own that the default branch contains. A fresh branch
    // (tip == default tip) is contained too, but has nothing to merge yet: open.
    const base = defaultBranch(ctx);
    const tip = (r: string) => git(ctx, "rev-parse", r).out.trim();
    const merged = tip(ref) !== tip(base) && git(ctx, "merge-base", "--is-ancestor", ref, base).ok;
    return { status: "found", value: merged ? "merged" : "open" };
  },

  async resolve(keys, ctx) {
    const out: Keys = {};
    if (!keys.branch && keys.slug && branchRef(ctx, keys.slug)) {
      return { keys: { branch: keys.slug } }; // a branch name without a prefix, e.g. main
    }
    if (!keys.branch && keys.slug) {
      // a slug alone: find the branch named after it (feat/hero-mcp-server for hero-mcp-server)
      const refs = git(ctx, "for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes/origin");
      const names = [...new Set(refs.out.split("\n").filter(Boolean).map((r) => r.replace(/^origin\//, "")))]
        .filter((n) => n !== "HEAD" && n !== "origin")
        .filter((n) => slugMatches(keys.slug!, n) || slugMatches(splitBranch(n, ctx.registry).slug, keys.slug!));
      if (names.length === 1) return { keys: { branch: names[0]! } };
      if (names.length > 1) {
        return { candidates: names.map((n) => ({ label: `branch ${n}`, keys: { branch: n }, open: true })), notes: [`Several branches match '${keys.slug}'; none chosen.`] };
      }
      return {};
    }
    if (!keys.branch) return {};
    const { slug, agent } = splitBranch(keys.branch, ctx.registry);
    out.slug = slug;
    if (agent) out.agent = agent;
    const ref = branchRef(ctx, keys.branch);
    if (ref) {
      const log = git(ctx, "log", "--format=%s", `${defaultBranch(ctx)}..${ref}`);
      if (log.ok) Object.assign(out, { ...extractKeys(ctx.project.identity, log.out), ...out });
      Object.assign(out, { ...extractKeys(ctx.project.identity, keys.branch), ...out });
    }
    return { keys: out };
  },

  async context(keys, ctx): Promise<Section[]> {
    if (!keys.branch) return [];
    const b = keys.branch;
    const local = git(ctx, "rev-parse", "--verify", "--quiet", `refs/heads/${b}`).ok;
    const remote = git(ctx, "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${b}`).ok;
    const ref = branchRef(ctx, b);
    const base = defaultBranch(ctx);
    const L: string[] = [];
    const current = currentBranch(ctx) === b;
    L.push(`- \`${b}\`: ${[local && "local", remote && "on origin", current && "**checked out**"].filter(Boolean).join(", ") || "not found"}`);
    if (!ref) return [{ title: "Branch", body: L.join("\n") }];

    if (local && remote) {
      const r = git(ctx, "rev-list", "--left-right", "--count", `refs/heads/${b}...refs/remotes/origin/${b}`);
      const [ahead, behind] = r.out.trim().split(/\s+/);
      if (ahead !== "0" || behind !== "0") L.push(`- local vs origin: ${ahead} ahead, ${behind} behind`);
    }
    const counts = git(ctx, "rev-list", "--left-right", "--count", `${ref}...${base}`).out.trim().split(/\s+/);
    L.push(`- vs \`${base}\`: ${counts[0]} commits ahead, ${counts[1]} behind`);

    const log = git(ctx, "log", "--format=%h %an, %ar: %s", "-n", "10", `${base}..${ref}`);
    if (log.ok && log.out.trim()) L.push("", "Commits on the branch (newest first):", "", ...log.out.trim().split("\n").map((l) => `- ${l}`));

    if (current) {
      const st = git(ctx, "status", "--porcelain");
      const files = st.out.split("\n").filter(Boolean);
      L.push("", files.length ? `**Uncommitted changes: ${files.length} files**` : "Working tree clean.");
      if (files.length) L.push("", "```", ...files.slice(0, 30), ...(files.length > 30 ? [`… ${files.length - 30} more`] : []), "```");
    } else if (local || remote) {
      L.push("", `Not checked out. To continue: \`git switch ${b}\``);
    }
    return [{ title: "Branch", body: L.join("\n") }];
  },
};
