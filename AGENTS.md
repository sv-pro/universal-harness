# AGENTS.md

Guidance for AI coding agents and humans working on **universal-harness**: one
workspace model per project, validated against the user's agents and projected into
each agent's setup, so that any agent can pick up work another agent started.

Start with `docs/model.md`. It defines the categories and records which real
instance each one came from.

## Layout

```
docs/model.md                the categories (resource, knowledge, flow, role, ...)
registry/agents.yaml         the user's agents: capabilities, config locations, reach
projects/<id>/project.yaml   one manifest per described project
src/schema.ts                zod schemas, one block per model section
src/validate.ts              cross-reference checks (manifest × registry)
src/brief.ts                 manifest → agent-facing brief (markdown)
src/cli.ts                   `uh validate|brief`
test/                        node:test
```

## Conventions

- **Instance first.** Change a category in `docs/model.md` only together with the
  concrete instance (a file, a config, a workflow in a real project) that forces it,
  and say which. Don't add fields for cases no project has.
- **Don't invent facts in manifests.** If a project's repo doesn't say it, mark it
  `unverified` or leave it out; the validator reports the gap.
- **The model is provider-neutral.** `kind` and `provider` are open strings; no code
  branches on a specific provider or agent id.
- TypeScript runs directly on Node ≥ 24 (type stripping): erasable syntax only (no
  enums, no parameter properties), relative imports end in `.ts`.

## Check

```bash
npm run check   # tsc + tests + validate every manifest under projects/
```

## Continuity

Keep `HANDOFF.md` current **as you work**, not at the end: what you are doing, what
is done, what is next, what is unverified. You may be cut off at any moment.
