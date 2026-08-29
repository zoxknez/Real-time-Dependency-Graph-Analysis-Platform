"use client";

/**
 * War Room WebMCP Bridge Host Component (WMCP-4D)
 *
 * Client-only headless host that mounts the live adaptive WebMCP registration session
 * bound to the shared WarRoomContext runtime and browser modelContext.
 * Follows INV-WMCP4D-003, INV-WMCP4D-012, INV-WMCP4D-013, INV-WMCP4D-014, and INV-WMCP4D-015.
 */

import { useEffect, useRef } from "react";
import { useWarRoomContext } from "./war-room-provider";
import {
  createBrowserWebMcpPlatformAdapter,
  createLiveAdaptiveRegistrationSession,
  LiveAdaptiveRegistrationSession,
} from "../../lib/webmcp";

export function WarRoomWebMcpBridge(): null {
  const { statePort, actions, projectionStore } = useWarRoomContext();
  const adapterRef = useRef(createBrowserWebMcpPlatformAdapter());

  useEffect(() => {
    let session: LiveAdaptiveRegistrationSession | null = createLiveAdaptiveRegistrationSession({
      statePort,
      actions,
      projectionStore,
      platformAdapter: adapterRef.current,
    });

    session.start().catch(() => {
      // Non-fatal: Progressive enhancement guarantees registration failure does not crash the UI
    });

    return () => {
      if (session) {
        session.dispose();
        session = null;
      }
    };
  }, [statePort, actions, projectionStore]);

  return null;
}
