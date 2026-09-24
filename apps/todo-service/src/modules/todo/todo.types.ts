import type {
  TodoState,
} from "@todo/contracts";

export interface TodoDatabaseRow {
  readonly id: string;

  readonly owner_id: string;

  readonly title: string;

  readonly description:
    | string
    | null;

  readonly state:
    TodoState;

  readonly due_date:
    | Date
    | null;

  readonly created_at:
    Date;

  readonly updated_at:
    Date;
}

export interface CreateTodoData {
  readonly id: string;

  readonly ownerId: string;

  readonly title: string;

  readonly description:
    | string
    | null;

  readonly state:
    TodoState;

  readonly dueDate:
    | Date
    | null;

  readonly occurredAt:
    Date;
}