import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import {
  env,
} from "../../../config/env.js";

const algorithm = "aes-256-gcm";

function getKey(): Buffer {
  return createHash("sha256")
    .update(env.INTERNAL_SERVICE_SECRET)
    .digest();
}

export function encryptPasswordResetToken(
  resetToken: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    algorithm,
    getKey(),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(resetToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPasswordResetToken(
  encryptedToken: string,
): string {
  const parts = encryptedToken.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted password reset token");
  }

  const [ivPart, authTagPart, ciphertextPart] = parts;

  if (
    ivPart === undefined ||
    authTagPart === undefined ||
    ciphertextPart === undefined
  ) {
    throw new Error("Invalid encrypted password reset token");
  }

  const decipher = createDecipheriv(
    algorithm,
    getKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(
    Buffer.from(authTagPart, "base64url"),
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(ciphertextPart, "base64url"),
    ),
    decipher.final(),
  ]).toString("utf8");
}