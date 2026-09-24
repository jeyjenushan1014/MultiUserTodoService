/*
This class mainly used to handle the validation error, authentication error,
Not found, conflict, rate limit those errors we separate from the unexcepted programming errors.
*/

import type {
  ErrorDetail,
} from "@todo/contracts";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  public readonly details:
    | readonly ErrorDetail[]
    | undefined;

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: readonly ErrorDetail[],
  ) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(
      this,
      AppError,
    );
  }
}