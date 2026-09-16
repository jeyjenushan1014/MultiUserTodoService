export const TODO_STATES = [
  "pending",
  "in_progress",
  "completed",
] as const;

export type TodoState =
  (typeof TODO_STATES)[number];

export interface TodoDatabaseRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  state: TodoState;
  due_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Todo {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  state: TodoState;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTodoInput {
  title: string;
  description?: string | null;
  state?: TodoState;
  dueDate?: string | null;
}
