// Schemas for the two inputs of the harness: a per-user agent registry and a
// per-project manifest. Category definitions and their origin: docs/model.md.
import { z } from "zod";

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase id: a-z, 0-9, -");

// ---------------------------------------------------------------- agents (§7)

export const Agent = z.strictObject({
  id: Id,
  name: z.string(),
  status: z.enum(["active", "occasional", "retired"]).default("active"),
  runs: z.array(z.enum(["local", "cloud"])).min(1),
  surfaces: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  instructions: z.strictObject({
    entry: z.string(), // file the agent reads first, e.g. "AGENTS.md"
    via: z.string().optional(), // how it reaches AGENTS.md, e.g. "CLAUDE.md imports @AGENTS.md"
    imports: z.string().optional(), // line that makes a new entry file include AGENTS.md, e.g. "@AGENTS.md"
    max_bytes: z.number().int().positive().optional(), // the agent truncates its entry file beyond this
  }),
  // Project-scoped MCP config the agent reads from the repo, if it has one.
  project_mcp: z.strictObject({ path: z.string(), format: z.enum(["mcp-json", "gemini-settings"]) }).optional(),
  extensions: z.array(z.string()).default([]),
  mcp_config: z.string().optional(),
  // Branch prefixes this agent pushes under, e.g. Grok Bot pushes `cursor/...`.
  branch_prefixes: z.array(z.string()).default([]),
  // What this agent can reach today, as declared by the user (not detected yet).
  connections: z
    .strictObject({
      mcp: z.array(z.string()).default([]),
      cli: z.array(z.string()).default([]),
      native: z.array(z.string()).default([]), // providers the agent integrates with itself, e.g. github
    })
    .default({ mcp: [], cli: [], native: [] }),
  notes: z.array(z.string()).default([]),
});
export type Agent = z.infer<typeof Agent>;

// MCP servers the user can connect agents to, and how each agent gets them.
export const Connection = z.strictObject({
  id: Id,
  name: z.string(),
  url: z.string().optional(), // remote MCP endpoint (streamable HTTP); absent = no portable config
  auth: z.enum(["oauth", "token", "none"]).default("oauth"),
  // How we know the url works: none (from memory), docs (provider's docs checked), live (a client connected).
  evidence: z.enum(["none", "docs", "live"]).default("none"),
  evidence_note: z.string().optional(),
  per_agent: z.record(z.string(), z.string()).default({}), // agent id -> how to connect when not by url
  note: z.string().optional(),
});
export type Connection = z.infer<typeof Connection>;

export const AgentRegistry = z.strictObject({
  agents: z.array(Agent).min(1),
  connections: z.array(Connection).default([]),
});
export type AgentRegistry = z.infer<typeof AgentRegistry>;

// ------------------------------------------------------------- resources (§1)

export const Access = z.strictObject({
  via: z.enum(["mcp", "cli", "api", "ci", "web"]),
  actor: z.enum(["agent", "human"]).default("agent"),
  // mcp server name or cli tool name an agent needs for this access path
  tool: z.string().optional(),
  note: z.string().optional(),
});
export type Access = z.infer<typeof Access>;

export const Resource = z.strictObject({
  id: Id,
  kind: z.string(), // open vocabulary: code-host, issue-tracker, ci, hosting, ...
  provider: z.string(),
  locator: z.string(),
  access: z.array(Access).min(1),
  note: z.string().optional(),
});
export type Resource = z.infer<typeof Resource>;

// ------------------------------------------------------------- knowledge (§2)

export const Knowledge = z.strictObject({
  ref: z.string(), // repo-relative path, or "<resource-id>:<locator>"
  role: z.string(),
  authority: z.enum(["normative", "descriptive", "ephemeral"]),
  lifetime: z.enum(["permanent", "release", "item", "session"]).default("permanent"),
  truth_for: z.array(z.string()).default([]),
  note: z.string().optional(),
});
export type Knowledge = z.infer<typeof Knowledge>;

// ------------------------------------------------------ procedures/checks (§5)

export const Procedure = z.strictObject({
  id: Id,
  kind: z.enum(["recipe", "obligation", "prohibition"]),
  summary: z.string(),
  run: z.array(z.string()).default([]),
  when: z
    .strictObject({
      paths: z.array(z.string()).default([]),
      event: z.string().optional(),
    })
    .optional(),
  enforced_by: z
    .strictObject({ ci: z.string().optional(), hook: z.string().optional() })
    .optional(), // absent = prose only
  // Files the obligation requires to change in the same unit of work when `when.paths` match.
  touches: z.array(z.string()).default([]),
  entry: z.record(z.string(), z.string()).default({}), // agent id -> command/skill
  defined_in: z.string().optional(),
});
export type Procedure = z.infer<typeof Procedure>;

// ------------------------------------------------- work: carriers, flows (§3)

export const Carrier = z.strictObject({
  id: Id,
  kind: z.string(), // folder, status, issue-state, pr-state, branch, checkbox, section
  locator: z.string(),
  resource: Id.optional(),
  key: z.string().optional(), // identity key that finds the item here: an identity key id, "branch" or "slug"
  paths: z.array(z.string()).default([]), // file carriers: repo-relative templates with {slug}
  field: z.string().optional(), // frontmatter carriers: the field holding the state
});
export type Carrier = z.infer<typeof Carrier>;

const OneOrMany = z.union([Id, z.array(Id).min(1)]);

export const Flow = z.strictObject({
  id: Id,
  summary: z.string(),
  items: z.array(z.string()).min(1),
  defined_in: z.string().optional(),
  carriers: z.strictObject({
    primary: Id,
    mirrors: z
      .array(z.strictObject({ carrier: Id, sync: z.enum(["manual", "auto"]).default("manual") }))
      .default([]),
  }),
  states: z
    .array(
      z.strictObject({
        id: Id,
        summary: z.string().optional(),
        terminal: z.boolean().default(false),
        values: z.record(z.string(), z.string()).default({}), // carrier id -> value
      }),
    )
    .min(2),
  transitions: z
    .array(
      z.strictObject({
        from: OneOrMany,
        to: Id,
        by: Id, // role id
        checks: z.array(Id).default([]), // procedure ids that gate the transition
        effects: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});
export type Flow = z.infer<typeof Flow>;

// ---------------------------------------------------------------- roles (§4)

export const Role = z.strictObject({
  id: Id,
  summary: z.string(),
  actor: z.enum(["agent", "human", "automation"]).default("agent"),
  inbox: z.array(z.string()).default([]), // "<flow>.<state>"
  writes: z.array(z.string()).default([]),
  uses: z.array(Id).default([]), // resource ids the role needs to reach
  requires: z.array(z.string()).default([]), // agent capabilities
  agents: z.array(Id).default([]), // preference order
  defined_in: z.string().optional(),
});
export type Role = z.infer<typeof Role>;

// ------------------------------------------------------------- identity (§3)

// Built-in keys every project has: "branch" and "slug" (the branch name without its prefix).
export const BUILTIN_KEYS = ["branch", "slug", "pr"] as const;

export const Identity = z.strictObject({
  keys: z
    .array(
      z.strictObject({
        id: Id,
        pattern: z.string(), // regex finding the key in any text (titles, commit subjects, branch names)
        note: z.string().optional(),
      }),
    )
    .default([]),
  mention: z.string().optional(), // how items are cited in titles and commits, e.g. "[{linear} / {github}]"
  branch: z.string().optional(), // naming convention, documentation only
  examples: z.array(z.string()).default([]),
});
export type Identity = z.infer<typeof Identity>;

// ----------------------------------------------------------- continuity (§8)

export const Continuity = z.strictObject({
  records: z
    .array(
      z.strictObject({
        level: z.enum(["session", "item", "project"]),
        location: z.string(),
        path: z.string().optional(), // file record: repo-relative, may use {slug}; read from the item's branch
        cadence: z.string(),
        reachable_by: z.array(z.enum(["local", "cloud"])).min(1),
      }),
    )
    .default([]),
});
export type Continuity = z.infer<typeof Continuity>;

// ---------------------------------------------------------------- policy (§6)

export const PolicyRef = z.strictObject({ agent: Id, path: z.string(), note: z.string().optional() });

// --------------------------------------------------------------- project

export const Project = z.strictObject({
  project: z.strictObject({
    id: Id,
    summary: z.string(),
    repo: z.strictObject({ path: z.string(), resource: Id.optional() }),
  }),
  resources: z.array(Resource).default([]),
  knowledge: z.array(Knowledge).default([]),
  procedures: z.array(Procedure).default([]),
  carriers: z.array(Carrier).default([]),
  flows: z.array(Flow).default([]),
  roles: z.array(Role).default([]),
  identity: Identity.default({ keys: [], examples: [] }),
  continuity: Continuity.default({ records: [] }),
  policy: z.array(PolicyRef).default([]),
});
export type Project = z.infer<typeof Project>;
