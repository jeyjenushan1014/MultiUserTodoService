import { database } from "../../config/database";
import { CreateTodoInput, Todo, TodoDatabaseRow } from "./todo.types";

const TODO_COLUMNS = `
  id,
  owner_id,
  title,
  description,
  state,
  due_date,
  created_at,
  updated_at
`;


function mapTodoRow(
  row: TodoDatabaseRow,
): Todo {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    state: row.state,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createTodo(
  ownerId: string,
  input: CreateTodoInput,
): Promise<Todo> {
  const result =
    await database.query<TodoDatabaseRow>(
      `
        INSERT INTO todos (
          owner_id,
          title,
          description,
          state,
          due_date
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5
        )
        RETURNING ${TODO_COLUMNS}
      `,
      [
        ownerId,
        input.title,
        input.description ?? null,
        input.state ?? "pending",
        input.dueDate ?? null,
      ],
    );

    

  return mapTodoRow(result.rows[0]!);
}