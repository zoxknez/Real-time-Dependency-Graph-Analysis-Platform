import { test, expect } from "@playwright/test";
import { validateFocusCriticalPathInput } from "../src/lib/webmcp/bridge/adaptive-validation";
import { deriveDesiredToolSurface } from "../src/lib/webmcp/lifecycle/surface";

test.describe("WMCP-12 critical-path focus boundary", () => {
  test("accepts only authoritative pathId input", () => {
    expect(validateFocusCriticalPathInput({ pathId: "scenario:consumer" }).ok).toBe(true);
    expect(validateFocusCriticalPathInput({ pathId: "scenario:consumer", nodeIds: ["injected"] }).ok).toBe(false);
    expect(validateFocusCriticalPathInput({ pathId: "" }).ok).toBe(false);
  });

  test("is exposed only in PLAN_READY", () => {
    expect(deriveDesiredToolSurface({ phase: "HUMAN_REVIEW", contextRevision: 1, webMcpAvailability: "AVAILABLE" }).toolNames.has("focus_critical_path")).toBe(false);
    expect(deriveDesiredToolSurface({ phase: "PLAN_READY", contextRevision: 2, webMcpAvailability: "AVAILABLE" }).toolNames.has("focus_critical_path")).toBe(true);
  });
});
