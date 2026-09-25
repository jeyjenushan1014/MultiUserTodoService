import type {
  Request,
} from "express";

import type {
  CallerIdentity,
} from "@todo/contracts";

import {
  extractBearerToken,
  verifyAccessTokenClaims,
} from "./access-token-claims.js";

/*
 * Signature-only verification, deliberately without the live-session
 * check `authenticate` middleware performs. Logout must still succeed
 * against a token whose session was already ended (idempotent logout,
 * or a session terminated elsewhere by reuse detection).
 */
export async function verifyAccessToken(
  request: Request,
): Promise<CallerIdentity> {
  const token =
    extractBearerToken(request);

  const claims =
    await verifyAccessTokenClaims(token);

  return {
    userId: claims.userId,
    sessionId: claims.sessionId,
    email: claims.email,
  };
}
