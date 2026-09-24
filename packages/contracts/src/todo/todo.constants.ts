export const TODO_STATES = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const TODO_SORT_FIELDS = [
  "createdAt",
  "dueDate",
] as const;

export const SORT_ORDERS = [
  "asc",
  "desc",
] as const;

export const DEFAULT_TODO_PAGE = 1;

export const DEFAULT_TODO_PAGE_SIZE = 20;

export const MAXIMUM_TODO_PAGE_SIZE = 100;

export const MAXIMUM_TODO_TITLE_LENGTH = 200;

export const MAXIMUM_TODO_DESCRIPTION_LENGTH =
  5000;


export const DEFAULT_TODO_SORT_FIELD =
  "createdAt" as const;

export const DEFAULT_SORT_ORDER =
  "desc" as const;
