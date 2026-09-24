/*
This package mainly used for all the services get same error response shape
*/

export interface ErrorDetail {
  readonly field?: string;
  readonly message: string;
}

export interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly ErrorDetail[];
  };
}