import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  ResolveAccountRequest,
  ResolveAccountResponse,
} from "@todo/contracts";

import {
  PostgresAccountLookupRepository,
} from "./postgres-account-lookup.repository.js";

import {
  AccountLookupService,
} from "./account-lookup.service.js";

const repository =
  new PostgresAccountLookupRepository();

const service =
  new AccountLookupService(
    repository,
  );

type ResolveAccountHttpRequest =
  Request<
    Record<string, never>,
    ResolveAccountResponse,
    ResolveAccountRequest
  >;

type ResolveAccountHttpResponse =
  Response<
    ResolveAccountResponse
  >;

/*
The validateBody middleware runs before this
controller.

It validates request.body and replaces it with the
parsed and normalized Zod result.

Therefore, request.body.email is already:

- present;
- a valid email;
- trimmed;
- lowercase.
*/
export async function resolveAccountController(
  request:
    ResolveAccountHttpRequest,
  response:
    ResolveAccountHttpResponse,
  next:
    NextFunction,
): Promise<void> {
  try {
    const result =
      await service.execute(
        request.body.email,
      );

    response
      .status(200)
      .json(
        result,
      );
  } catch (error) {
    next(error);
  }
}