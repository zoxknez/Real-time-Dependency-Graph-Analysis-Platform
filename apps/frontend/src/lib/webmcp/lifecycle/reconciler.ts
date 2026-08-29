/**
 * WebMCP Reconciliation Planner (WMCP-4A)
 *
 * Pure, deterministic calculation of diff operations (toRegister, toRetain, toRemove)
 * needed to transition an actual registration set to a desired surface.
 * Follows WMCP-INV-014, WMCP-INV-015, WMCP-INV-019.
 */

import { WebMcpActionName, WebMcpReconciliationPlan } from "./types";

/**
 * Computes a deterministic reconciliation plan by comparing currently registered tool names
 * against the desired tool set.
 *
 * Guaranteed Properties:
 * - Deterministic: outputs are ordered consistently.
 * - Idempotent: when actual equals desired, `toRegister` and `toRemove` are empty.
 */
export function computeReconciliationPlan(
  actual: ReadonlySet<WebMcpActionName>,
  desired: ReadonlySet<WebMcpActionName>
): WebMcpReconciliationPlan {
  const toRegister: WebMcpActionName[] = [];
  const toRetain: WebMcpActionName[] = [];
  const toRemove: WebMcpActionName[] = [];

  for (const name of desired) {
    if (actual.has(name)) {
      toRetain.push(name);
    } else {
      toRegister.push(name);
    }
  }

  for (const name of actual) {
    if (!desired.has(name)) {
      toRemove.push(name);
    }
  }

  // Sort deterministically to avoid nondeterministic registration order
  toRegister.sort();
  toRetain.sort();
  toRemove.sort();

  return {
    toRegister,
    toRetain,
    toRemove,
  };
}
