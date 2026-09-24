/*
This file explains the purpose and functionality of the validate function,
 which is used to validate incoming requests in an Express.js application.
 which validate the request's body,params,query using zod schema
*/


import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "./app-error.js";

interface RequestParts {
  body: unknown;
  params: unknown;
  query: unknown;
}

/*
This function takes a zod schema as an argument and returns an express request handler function.
This handler function validate the incoming request's body,params and query against the provided schema.
If the validation fails,it creates an AppError with a 400 status code and passes it to the next middleware.
If the validation success, it updates the request object with the validated data and calls the next middleware.
*/
export function validate<T extends RequestParts>(
  schema: ZodType<T>,
): RequestHandler {
  return (request, _response, next) => {
    const input: RequestParts = {
      // Express defines request.body loosely.
      // This boundary converts it into validated data.
      body: request.body ?? {},
      params: request.params,
      query: request.query,
    };

    const result = schema.safeParse(input);

    if (!result.success) {
      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Invalid request",
          {
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        ),
      );

      return;
    }


    if (result.data.body !== undefined) {
      request.body = result.data.body;
    }

    if (result.data.params !== null && result.data.params !== undefined) {
        request.params = result.data.params as typeof request.params;
    }

    if (result.data.query !== undefined) {
         Object.defineProperty(request, "query", {
                configurable: true,
                 value: result.data.query,
    });
    }

    next();

  };
}