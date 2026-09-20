export interface CallerIdentity {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
}

export interface InternalIdentityEnvelope
  extends CallerIdentity {
  readonly requestId: string;
  readonly issuedAt: number;
}