import {
  SignJWT,
} from "jose";

import {
  env,
} from "../config/env.js";

export interface AccessTokenInput {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
}

const secret =
  new TextEncoder()
    .encode(env.JWT_SECRET);

export async function createAccessToken(
  input: AccessTokenInput,
): Promise<string> {
  return new SignJWT({
    sid: input.sessionId,
    email: input.email,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(input.userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(
      `${env.ACCESS_TOKEN_TTL_SECONDS}s`,
    )
    .sign(secret);
}