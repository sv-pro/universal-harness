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
src/identity.ts              item keys: extract, seed from a ref, branch → agent
src/pickup.ts                resolve an item, read its carriers, infer flow state
src/pickup-render.ts         pickup report → markdown
src/providers/               the only provider-specific code: git, github (gh), linear (API), files
src/cli.ts                   `uh validate|brief|pickup`
test/                        node:test
```

## Conventions

- **Instance first.** Change a category in `docs/model.md` only together with the
  concrete instance (a file, a config, a workflow in a real project) that forces it,
  and say which. Don't add fields for cases no project has.
- **Don't invent facts in manifests.** If a project's repo doesn't say it, mark it
  `unverified` or leave it out; the validator reports the gap.
- **The model is provider-neutral.** `kind` and `provider` are open strings; only
  `src/providers/*` knows a provider, and no code branches on an agent id.
- **Pickup never guesses.** What cannot be read goes under Gaps; what is ambiguous
  goes under Related items; a file from another branch is never attributed to the item.
- TypeScript runs directly on Node ≥ 24 (type stripping): erasable syntax only (no
  enums, no parameter properties), relative imports end in `.ts`.

## Check

```bash
npm run check   # tsc + tests + validate every manifest under projects/
```

## Continuity

Keep `HANDOFF.md` current **as you work**, not at the end: what you are doing, what
is done, what is next, what is unverified. You may be cut off at any moment.
