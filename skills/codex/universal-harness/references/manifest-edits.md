# Manifest and registry edits

Read these authoritative files from the actual universal-harness checkout when changing inputs:

- `docs/model.md`: categories and the real instances that justify them.
- `src/schema.ts`: accepted fields and defaults; objects reject unknown fields.
- `.uh/project.yaml`: the harness's small real manifest.
- `test/fixtures/ai2rules.project.yaml`: a larger snapshot, useful as a structural example, never as a source of facts about a different project.

Inspect the target repo's instructions, workflows, remotes, and handoff records before describing it. Keep `.uh/project.yaml` in the target project; the harness checkout holds the shared `registry/agents.yaml` and optional local index `registry/projects.yaml`. Update shared registry facts only when that change belongs to the request.

Record only evidenced resources, knowledge, procedures, roles, carriers, flows, identity, continuity, and policy references. Keep unknown facts out or label them unverified in an existing schema-supported note; do not add a made-up `unverified` field or invent statuses, capabilities, tracker links, or access. A connection's `evidence` uses `none`, `docs`, or `live`: documentation or configuration alone does not justify `live`.

Prefer the manifest's implicit containing-repo path where appropriate. An external fixture needs an explicit repo path; `~/` supports home-relative paths. Verify any explicit path before provisioning.

Keep `kind` and `provider` open and distinct. Bind roles by the registry's agent ids and capability/access evidence. State mappings must use the carrier's actual values; multiple values can map to one state. Preserve declared primary carriers and mirror sync modes. Read the existing procedure definitions when changing checks or obligations.

Do not extend the model to accommodate hypothetical projects. If a real instance cannot be represented, explain the concrete gap; changing the tool/schema is a separate implementation task governed by that repo's instructions. Long-range material in `design/` is direction, not implemented CLI functionality.

Validate the edited inputs with the actual CLI. For setup changes, inspect the provision preview and regenerate within the user's requested scope, then verify the generated result as described in SKILL.md. Do not hand-edit generated blocks to make a validation or freshness failure disappear.
