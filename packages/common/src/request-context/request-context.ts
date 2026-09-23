/*
When an HTTP request enters your service,
 store information such as requestId and serviceName
  once, and then access it from anywhere 
  during that request without passing those values through every function.

*/


import {
  AsyncLocalStorage,
} from "node:async_hooks";

export interface RequestContext {
  readonly requestId: string;

  readonly serviceName:
    | "gateway"
    | "account-service"
    | "todo-service";
}

const requestContextStorage =
  new AsyncLocalStorage<
    RequestContext
  >();

export function runWithRequestContext<
  TResult,
>(
  context: RequestContext,
  callback: () => TResult,
): TResult {
  return requestContextStorage.run(
    context,
    callback,
  );
}

export function getRequestContext():
  RequestContext | undefined {
  return requestContextStorage
    .getStore();
}

export function getRequestId():
  string | undefined {
  return getRequestContext()
    ?.requestId;
}

export function requireRequestId():
  string {
  const requestId =
    getRequestId();

  if (requestId === undefined) {
    throw new Error(
      "Request context is unavailable",
    );
  }

  return requestId;
}

export function getServiceName():
  RequestContext["serviceName"] |
  undefined {
  return getRequestContext()
    ?.serviceName;
}