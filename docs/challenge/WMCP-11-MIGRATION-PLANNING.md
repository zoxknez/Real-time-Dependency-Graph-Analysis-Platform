# WMCP-11: Deterministic Migration Planning

WMCP-11 generates a bounded application-state plan only after human review. Candidate entities require an explicit priority and are omitted when excluded or unprioritized. The planner consumes the latest context-bound WMCP-8 exposure result and WMCP-10 critical-path result; it does not traverse the graph, evaluate versions, fetch OSV, edit source, or invent a replacement requirement.

Step kinds distinguish target intent, range-exposed validation, blocked requirement review, unknown metadata resolution, critical-path validation, breaking-finding verification, and available advisory review. A range-exposed dependent is never described as broken. Plans contain `stepsTotal`, `returnedSteps`, `stepsTruncated`, deterministic ordering, and machine-readable source facts with a cap of 50 steps.

Authority: `WarRoomActions.generateMigrationPlan` -> `createDeterministicMigrationPlanningPort`. Historical WMCP-6 snapshots are not written.
