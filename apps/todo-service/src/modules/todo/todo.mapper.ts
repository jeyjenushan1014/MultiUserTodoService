import type {
  TodoResponse,
} from "@todo/contracts";

import type {
  TodoDatabaseRow,
} from "./todo.types.js";

export function mapTodoRow(
  row: TodoDatabaseRow,
): TodoResponse {
  return {
    id:
      row.id,

    ownerId:
      row.owner_id,

    title:
      row.title,

    description:
      row.description,

    state:
      row.state,

    dueDate:
      row.due_date === null
        ? null
        : row.due_date
            .toISOString(),

    createdAt:
      row.created_at
        .toISOString(),

    updatedAt:
      row.updated_at
        .toISOString(),
  };
}