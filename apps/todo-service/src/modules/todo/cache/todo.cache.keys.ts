export const TODO_CACHE_PREFIX =
  "todo";

export const TODO_VERSION_PREFIX =
  "todo:version";

export function createTodoVersionKey(
  ownerId: string,
): string {
  return [
    TODO_VERSION_PREFIX,
    ownerId,
  ].join(":");
}

export function createTodoItemCacheKey(
  ownerId: string,
  version: string,
  todoId: string,
): string {
  return [
    TODO_CACHE_PREFIX,
    ownerId,
    version,
    "item",
    todoId,
  ].join(":");
}

export function createTodoListCacheKey(
  ownerId: string,
  version: string,
  queryIdentifier: string,
): string {
  return [
    TODO_CACHE_PREFIX,
    ownerId,
    version,
    "list",
    queryIdentifier,
  ].join(":");
}