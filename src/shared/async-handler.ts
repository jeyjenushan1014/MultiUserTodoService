/*
1: This file handles the asynchronous operations in the Express.js application. 
2: It exports a function called asyncHandler that takes a RequestHandler as an argument and returns a new RequestHandler. 
3: The returned handler wraps the original handler in a Promise, allowing it to catch any errors that occur during the execution of the handler and 
 pass them to the next middleware function for error handling.
4: This helps to simplify error handling in asynchronous routes and ensures that unhandled errors are properly propagated through the middleware chain.
5: limitation: synchronous errors thrown in the handler will not be caught by this wrapper and will need to be handled separately.
6: because the wrapper only catches errors that occur within the asynchronous context of the handler.
7: Async handler returning a Promise-Promise.resolve(somePromise);
8: Normal handler returning a value or undefined-Promise.resolve(undefined);

*/
import type { RequestHandler } from "express";

export function asyncHandler(
  handler: RequestHandler,
): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}