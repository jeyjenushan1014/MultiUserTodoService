/*
This file handles the asynchronous operations in the Express.js application. 
It exports a function called asyncHandler that takes a RequestHandler as an argument and
 returns a new RequestHandler. 
 The returned handler wraps the original handler in a Promise, 
 allowing it to catch any errors that occur during the execution of the handler and 
 pass them to the next middleware function for error handling.
  This helps to simplify error handling in asynchronous routes and 
  ensures that unhandled errors are properly propagated through the middleware chain.

*/
import type { RequestHandler } from "express";

export function asyncHandler(
  handler: RequestHandler,
): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}