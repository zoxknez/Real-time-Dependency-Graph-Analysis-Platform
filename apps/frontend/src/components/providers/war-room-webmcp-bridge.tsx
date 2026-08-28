"use client";

/**
 * War Room WebMCP Bridge Host Component (WMCP-3B)
 *
 * Client-only headless host that initiates primitive WebMCP tool registration
 * once the War Room exits BOOTSTRAP phase. Does not access browser model context
 * directly and uses the shared WarRoomContext runtime.
 */

import { useEffect, useRef } from "react";
import { useWarRoomContext } from "./war-room-provider";
import {
  createBrowserWebMcpPlatformAdapter,
  createPrimitiveTools,
  createPrimitiveWebMcpRegistrationSession,
} from "../../lib/webmcp";

export function WarRoomWebMcpBridge(): null {
  const { statePort, actions, projectionStore } = useWarRoomContext();
  const adapterRef = useRef(createBrowserWebMcpPlatformAdapter());

  useEffect(() => {
    let session: ReturnType<typeof createPrimitiveWebMcpRegistrationSession> | null = null;
    let unsub: (() => void) | null = null;
    let started = false;

    function tryStartRegistration() {
      if (started) return;
      const currentPhase = statePort.getState().phase;
      if (currentPhase === "BOOTSTRAP") return;

      started = true;
      if (unsub) {
        unsub();
        unsub = null;
      }

      const tools = createPrimitiveTools({
        statePort,
        actions,
        projectionStore,
      });

      session = createPrimitiveWebMcpRegistrationSession(adapterRef.current, tools);
      session.start().catch(() => {
        // Non-fatal: registration failure does not crash the UI
      });
    }

    if (statePort.getState().phase !== "BOOTSTRAP") {
      tryStartRegistration();
    } else {
      unsub = statePort.subscribe((state) => {
        if (state.phase !== "BOOTSTRAP") {
          tryStartRegistration();
        }
      });
    }

    return () => {
      if (unsub) {
        unsub();
        unsub = null;
      }
      if (session) {
        session.dispose();
        session = null;
      }
    };
  }, [statePort, actions, projectionStore]);

  return null;
}
