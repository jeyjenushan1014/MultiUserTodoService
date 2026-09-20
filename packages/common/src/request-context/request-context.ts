import {
  AsyncLocalStorage,
} from "node:async_hooks";

export interface RequestContext {
  readonly requestId: string;
  readonly serviceName: string;
  readonly userId?: string;
}

const requestContextStorage =
  new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext(
  context: RequestContext,
  callback: () => void,
): void {
  requestContextStorage.run(
    context,
    callback,
  );
}

export function getRequestContext():
RequestContext | undefined {
  return requestContextStorage.getStore();
}