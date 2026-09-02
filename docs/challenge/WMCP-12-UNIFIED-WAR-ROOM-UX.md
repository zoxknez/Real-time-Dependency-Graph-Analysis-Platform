# WMCP-12: Unified War Room UX

The `/graph` route is the challenge surface. Its status panel keeps API breaking findings, declared version exposure, topology, live evidence, human review, critical paths, and migration plans visibly separate. The UI states: `Declared version exposure does not prove downstream source incompatibility.`

`focus_critical_path` accepts only an authoritative available `pathId`, is valid only in `PLAN_READY`, and delegates visual mutation to the same `focusGraphNodes` action used by other callers. A failed or empty graph trace produces no critical path and cannot be focused.

Unavailable evidence and uncalculated analysis are shown as distinct states. Migration plans remain read-only product output and never modify source files or dependency manifests.
