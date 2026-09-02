# Final Evidence Matrix

| Area | Source | Verification |
|---|---|---|
| Shared authority | `apps/frontend/src/lib/war-room/application/actions.ts` | WebMCP action and parity suites |
| Exposure | `domain/version-exposure-engine.ts` | WMCP-8 matrix |
| Evidence | `app/api/evidence/package/route.ts`, `lib/evidence/osv-client.ts` | WMCP-9 matrix |
| Planning | `integration/migration-planning.ts` | TypeScript build and action suite |
| Critical focus | `application/actions.ts`, adaptive bridge | lifecycle and review suites |
| Unified UX | `components/war-room/war-room-status-panel.tsx` | frontend build/accessibility smoke |
| Tool surface | `bridge/adaptive-catalog.ts`, `lifecycle/surface.ts` | 16-tool/lifecycle suites |

Expected final tool counts: 16 canonical, 16 executable, 0 deferred. API integration tests requiring a running local service are environment-dependent and are not represented as passing here.
