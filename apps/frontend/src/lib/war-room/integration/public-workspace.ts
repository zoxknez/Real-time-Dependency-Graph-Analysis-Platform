/**
 * Public Workspace Security Context & Authorization Adapters
 *
 * Implements SecurityContextPort and AuthorizationPort for public workspace usage (WMCP-2C, Section 13-17).
 */

import {
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomAuthorizationRequest,
} from "../application/ports";
import {
  WarRoomSecurityContext,
  WarRoomServiceResult,
} from "../application/types";

export function createPublicWorkspaceSecurityContextPort(): WarRoomSecurityContextPort {
  return {
    async getSecurityContext(): Promise<WarRoomServiceResult<WarRoomSecurityContext>> {
      return {
        ok: true,
        data: {
          tenantId: "public",
          userId: "public",
        },
      };
    },
  };
}

export function createPublicWorkspaceAuthorizationPort(): WarRoomAuthorizationPort {
  return {
    async authorize(
      _request: WarRoomAuthorizationRequest
    ): Promise<WarRoomServiceResult<void>> {
      return {
        ok: true,
        data: undefined,
      };
    },
  };
}
