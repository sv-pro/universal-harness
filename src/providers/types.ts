// A provider reads one family of carriers (git, GitHub, Linear, files) and helps
// resolve item identity. Providers are the only provider-specific code; the
// pickup core works on carriers, flows and keys.
import { execFileSync } from "node:child_process";
import type { Keys } from "../identity.ts";
import type { AgentRegistry, Carrier, Project, Resource } from "../schema.ts";

export type ExecResult = { ok: boolean; out: string; err: string };

export type Ctx = {
  repo: string;
  exec: (cmd: string, args: string[]) => ExecResult;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  project: Project;
  registry: AgentRegistry;
  /** state values the project's flows give a carrier, e.g. the _tasks phase folders */
  valuesOf: (carrierId: string) => string[];
  /** read a repo file as of the item's branch (working tree if it is checked out, or if
   *  no branch is known and `branchOnly` is false) */
  readFile: (path: string, keys: Keys, branchOnly?: boolean) => { text: string; from: string } | undefined;
};

export type Reading =
  | { status: "found"; value: string; url?: string; detail?: string }
  | { status: "absent"; detail?: string }
  | { status: "unreadable"; reason: string };

export type Candidate = { label: string; keys: Keys; open: boolean };

export type Resolution = { keys?: Keys; drop?: string[]; candidates?: Candidate[]; notes?: string[] };

export type Section = { title: string; body: string };

export interface Provider {
  id: string;
  reads(c: Carrier, res: Resource | undefined): boolean;
  read(c: Carrier, keys: Keys, ctx: Ctx): Promise<Reading>;
  resolve?(keys: Keys, ctx: Ctx): Promise<Resolution>;
  context?(keys: Keys, ctx: Ctx): Promise<Section[]>;
}

export function realExec(repo: string): Ctx["exec"] {
  return (cmd, args) => {
    try {
      const out = execFileSync(cmd, args, {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 32 * 1024 * 1024,
      });
      return { ok: true, out, err: "" };
    } catch (e) {
      const x = e as { stdout?: string; stderr?: string; message: string };
      return { ok: false, out: x.stdout ?? "", err: (x.stderr || x.message).trim() };
    }
  };
}
