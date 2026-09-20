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
  readonly serviceName: string;
}

const requestContextStorage =
  new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {

    //While executing this callback and asynchronous operations created from it, make this context available.
  return requestContextStorage.run(
    context,
    callback,
  );
}

export function getRequestContext():
  RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getRequestId():
  string | undefined {
  return getRequestContext()?.requestId;
}