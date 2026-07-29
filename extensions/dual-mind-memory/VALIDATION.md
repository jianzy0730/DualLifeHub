# Validation

Validated on 2026-07-29 with a Node.js mock of the Operit runtime.

Covered flows:

- ToolPkg manifest and ZIP root structure.
- JavaScript syntax checks for `main.js` and `packages/dual_mind_memory.js`.
- `remember` → `recall`.
- `mark_memory` state change.
- `revise_memory` with revision node and link.
- Deterministic forgetting decision.
- Observation-period storage.
- `restore_memory` before purge.
- Forgetting-log inspection.
- Memory-state explanation.
- ToolPkg hook registration and automatic prompt recall injection.

The mock cannot prove compatibility with every Operit release; the package targets the current public APIs in the referenced Operit repository revision.
