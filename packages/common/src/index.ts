/*
This folder mainly used for technical reusable code.
*/
export {
  INTERNAL_IDENTITY_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  PLATFORM_NAME,
  REQUEST_ID_HEADER,
} from "./constants/platform.constants.js";

export {
  AppError,
} from "./errors/app-error.js";

export {
  asyncHandler,
} from "./http/async-handler.js";

export {
  getRequestContext,
  getRequestId,
  runWithRequestContext,
  requireRequestId
} from "./request-context/request-context.js";

export type {
  RequestContext
} from "./request-context/request-context.js";

export {
  decodeIdentity,
  encodeIdentity,
  signIdentity,
  verifyIdentitySignature,
} from "./security/identity-signature.js";

export {
  createOpaqueToken,
  hashOpaqueToken,
} from "./security/opaque-token.js";

export {
  isInternalIdentityEnvelope,
} from "./security/internal-identity.validator.js";