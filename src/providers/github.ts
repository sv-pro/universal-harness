// GitHub through the `gh` CLI: issues, PRs, checks. Uses the user's own gh login.
import { extractKeys } from "../identity.ts";
import type { Candidate, Ctx, Provider, Reading, Resolution, Section } from "./types.ts";

type Pr = {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  url: string;
  isDraft?: boolean;
  updatedAt?: string;
};

function gh<T>(ctx: Ctx, args: string[]): { ok: true; data: T } | { ok: false; err: string } {
  const r = ctx.exec("gh", args);
  if (!r.ok) return { ok: false, err: r.err.split("\n")[0] ?? "gh failed" };
  try {
    return { ok: true, data: JSON.parse(r.out) as T };
  } catch {
    return { ok: false, err: "gh returned non-JSON output" };
  }
}

const num = (key: string) => key.replace(/^#/, "");
const PR_FIELDS = "number,title,state,headRefName,url,isDraft,updatedAt";

function pickPr(prs: Pr[], ctx: Ctx): Resolution {
  if (!prs.length) return {};
  const open = prs.filter((p) => p.state === "OPEN");
  const candidates: Candidate[] = prs.map((p) => ({
    label: `PR #${p.number} (${p.state.toLowerCase()}) ${p.title}`,
    keys: { pr: String(p.number), branch: p.headRefName, ...extractKeys(ctx.project.identity, p.title) },
    open: p.state === "OPEN",
  }));
  const chosen = open.length === 1 ? open[0] : prs.length === 1 ? prs[0] : undefined;
  if (!chosen) return { candidates };
  return {
    keys: { pr: String(chosen.number), branch: chosen.headRefName, ...extractKeys(ctx.project.identity, chosen.title) },
    ...(prs.length > 1 ? { candidates } : {}),
  };
}

export const githubProvider: Provider = {
  id: "github",
  reads: (c, res) => res?.provider === "github" && (c.kind === "issue-state" || c.kind === "pr-state"),

  async read(c, keys, ctx): Promise<Reading> {
    if (c.kind === "issue-state") {
      const key = c.key ? keys[c.key] : undefined;
      if (!key) return { status: "absent", detail: `no ${c.key ?? "issue"} key` };
      const r = gh<{ state: string; title: string; url: string }>(ctx, ["issue", "view", num(key), "--json", "state,title,url"]);
      if (!r.ok) return /not found|could not resolve/i.test(r.err) ? { status: "absent", detail: r.err } : { status: "unreadable", reason: r.err };
      return { status: "found", value: r.data.state.toLowerCase(), url: r.data.url, detail: r.data.title };
    }
    // pr-state
    if (!keys.pr) return { status: "absent", detail: "no PR for this item" };
    const r = gh<Pr>(ctx, ["pr", "view", keys.pr, "--json", PR_FIELDS]);
    if (!r.ok) return { status: "unreadable", reason: r.err };
    // An open draft is still being worked on: report it as its own value.
    const value = r.data.state === "OPEN" && r.data.isDraft ? "draft" : r.data.state.toLowerCase();
    return { status: "found", value, url: r.data.url, detail: r.data.title };
  },

  async resolve(keys, ctx): Promise<Resolution> {
    // A "#n" may be a PR rather than an issue: GitHub numbers both from one sequence.
    if (keys.github && !keys.pr) {
      const r = gh<Pr>(ctx, ["pr", "view", num(keys.github), "--json", PR_FIELDS]);
      if (r.ok) {
        const fromTitle = extractKeys(ctx.project.identity, r.data.title);
        return {
          drop: ["github"],
          keys: { ...fromTitle, pr: String(r.data.number), branch: r.data.headRefName },
          notes: [`#${r.data.number} is a pull request${fromTitle.github ? `; its issue is ${fromTitle.github}` : ""}.`],
        };
      }
    }
    if (keys.branch && !keys.pr) {
      const r = gh<Pr[]>(ctx, ["pr", "list", "--head", keys.branch, "--state", "all", "--json", PR_FIELDS, "--limit", "10"]);
      if (r.ok) return pickPr(r.data, ctx);
    }
    if (!keys.branch && !keys.pr) {
      for (const k of ctx.project.identity.keys) {
        const v = keys[k.id];
        if (!v) continue;
        const r = gh<Pr[]>(ctx, ["pr", "list", "--state", "all", "--search", `"${v}" in:title`, "--json", PR_FIELDS, "--limit", "30"]);
        if (!r.ok) continue;
        const mentioning = r.data.filter((p) => extractKeys(ctx.project.identity, p.title)[k.id] === v);
        const res = pickPr(mentioning, ctx);
        if (res.keys || res.candidates) return res;
      }
    }
    return {};
  },

  async context(keys, ctx): Promise<Section[]> {
    if (!keys.pr) return [];
    type Check = { name?: string; context?: string; workflowName?: string; status?: string; conclusion?: string; state?: string; detailsUrl?: string; targetUrl?: string };
    type Full = Pr & { body: string; baseRefName: string; statusCheckRollup: Check[]; comments: { author: { login: string }; body: string; createdAt: string }[] };
    const r = gh<Full>(ctx, ["pr", "view", keys.pr, "--json", `${PR_FIELDS},body,baseRefName,statusCheckRollup,comments`]);
    if (!r.ok) return [{ title: `Pull request #${keys.pr}`, body: `Could not read: ${r.err}` }];
    const p = r.data;
    const L = [`[#${p.number}](${p.url}) **${p.title}**`, "", `${p.state.toLowerCase()}${p.isDraft ? " (draft)" : ""}, \`${p.headRefName}\` → \`${p.baseRefName}\`, updated ${p.updatedAt ?? "?"}`];

    const checks = (p.statusCheckRollup ?? []).map((c) => ({
      name: [c.workflowName, c.name ?? c.context].filter(Boolean).join(" / "),
      result: (c.conclusion || c.state || c.status || "?").toLowerCase(),
      url: c.detailsUrl ?? c.targetUrl,
    }));
    const bad = checks.filter((c) => /failure|error|cancelled|timed_out|action_required/.test(c.result));
    const pending = checks.filter((c) => /pending|queued|in_progress|expected/.test(c.result));
    if (checks.length) {
      L.push("", `Checks: ${checks.length - bad.length - pending.length} passed, **${bad.length} failing**, ${pending.length} pending.`);
      for (const c of [...bad, ...pending]) L.push(`- ${c.result}: ${c.name}${c.url ? ` (${c.url})` : ""}`);
    } else {
      L.push("", "No checks reported.");
    }
    const sections: Section[] = [{ title: `Pull request #${p.number}`, body: L.join("\n") }];
    const body = p.body ?? "";
    if (body.trim()) sections.push({ title: "PR description", body: quote(clip(body, 8000)) });
    const recent = (p.comments ?? []).slice(-3);
    if (recent.length) {
      sections.push({
        title: `Latest PR comments (${recent.length} of ${p.comments.length})`,
        body: recent.map((c) => `**${c.author.login}**, ${c.createdAt}:\n\n${quote(clip(c.body, 1500))}`).join("\n\n"),
      });
    }
    return sections;
  },
};

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters)` : s);
export const quote = (s: string) => s.trim().split("\n").map((l) => `> ${l}`).join("\n");
