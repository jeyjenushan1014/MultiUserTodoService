import type { SortOrder } from "./todo.types.js";

export interface TodoListCursor {
  readonly createdAt: string;
  readonly id: string;
  readonly sortOrder: SortOrder;
}

export function decodeTodoListCursor(encoded: string): TodoListCursor {
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(encoded)) {
    throw new TypeError("Invalid TODO list cursor");
  }
  const decoded = Buffer.from(encoded, "base64url");
  if (decoded.toString("base64url") !== encoded) {
    throw new TypeError("Invalid TODO list cursor");
  }
  const value: unknown = JSON.parse(decoded.toString("utf8"));
  if (
    typeof value !== "object" || value === null ||
    !("createdAt" in value) || typeof value.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(value.createdAt) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !("id" in value) || typeof value.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) ||
    !("sortOrder" in value) || (value.sortOrder !== "asc" && value.sortOrder !== "desc")
  ) {
    throw new TypeError("Invalid TODO list cursor");
  }
  if (new Date(value.createdAt).toISOString().slice(0, 23) !== value.createdAt.slice(0, 23)) {
    throw new TypeError("Invalid TODO list cursor timestamp");
  }
  return { createdAt: value.createdAt, id: value.id, sortOrder: value.sortOrder };
}

export function todoListCursorMatchesQuery(query: {
  readonly cursor?: string | undefined;
  readonly page: number;
  readonly sortBy: string;
  readonly sortOrder: SortOrder;
}): boolean {
  if (query.cursor === undefined) return true;
  if (query.page !== 1 || query.sortBy !== "createdAt") return false;
  try {
    return decodeTodoListCursor(query.cursor).sortOrder === query.sortOrder;
  } catch {
    return false;
  }
}
