/*
CallerIdentity represents the authenticated user
whose access token was verified by the Gateway.

InternalIdentityEnvelope extends that identity with
security metadata used for trusted communication
between the Gateway and internal services.
*/

export type InternalServiceAudience =
  | "account-service"
  | "todo-service";

export interface CallerIdentity {
  readonly userId: string;

  readonly sessionId: string;

  readonly email: string;
}

export interface InternalIdentityEnvelope
  extends CallerIdentity {
  /*
   * Only the Gateway is allowed to create internal
   * caller identity envelopes.
   */
  readonly issuer:
    "gateway";

  /*
   * The service that is allowed to accept this
   * envelope.
   *
   * This prevents an envelope created for the TODO
   * Service from being reused against Account
   * Service.
   */
  readonly audience:
    InternalServiceAudience;

  /*
   * Must match the trusted request context created
   * by the Gateway.
   */
  readonly requestId:
    string;

  /*
   * Unix timestamp in seconds.
   */
  readonly issuedAt:
    number;

  /*
   * Unix timestamp in seconds.
   *
   * The envelope must be rejected after this time.
   */
  readonly expiresAt:
    number;
}