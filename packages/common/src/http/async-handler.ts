/*
we don't need to repeately write the try/catch and when comes with reject easily pass to the next middleware.
*/

import type {
  RequestHandler,
} from "express";

export function asyncHandler(
  handler: RequestHandler,
): RequestHandler {
  return (
    request,
    response,
    next,
  ): void => {
    Promise
      .resolve(
        handler(
          request,
          response,
          next,
        ),
      )
      .catch(next);
  };
}