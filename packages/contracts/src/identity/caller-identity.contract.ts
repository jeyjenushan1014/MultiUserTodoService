/*
It is used to identify the authenticated user
*/

export interface CallerIdentity {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
}

/*
It is mainly used when gateway send the request to the internal service
*/
export interface InternalIdentityEnvelope
  extends CallerIdentity {
  readonly requestId: string;
  readonly issuedAt: number;
}