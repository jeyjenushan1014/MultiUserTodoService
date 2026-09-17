import { PoolClient } from "pg";
import { database } from "../../config/database";
import { CreateTodoInput, Todo, TodoDatabaseRow, ListTodoQuery } from "./todo.types";

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

export interface TodoListDatabaseResult {
  items: Todo[];
  totalItems: number;
}

export async function listTodos(
  ownerId: string,
  query: ListTodoQuery,
): Promise<TodoListDatabaseResult> {
  const client = await database.connect();

  try {
    //This query is mainly used to prevent the repeatable read anomaly
    //It ensures that the data read during the transaction is consistent and not affected by other concurrent transactions.
    await client.query(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );

    const result = await executeTodoListQueries(
      client,
      ownerId,
      query,
    );

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function executeTodoListQueries(
  client: PoolClient,
  ownerId: string,
  query: ListTodoQuery,
): Promise<TodoListDatabaseResult> {
  const conditions = [
    "owner_id = $1",
    "deleted_at IS NULL",
  ];

  const values: unknown[] = [ownerId];

  if (query.state !== undefined) {
    values.push(query.state);

    conditions.push(
      `state = $${values.length}`,
    );
  }

  const whereClause =
    conditions.join(" AND ");

  const countResult = await client.query<{
    total_items: number;
  }>(
    `
      SELECT COUNT(*)::int AS total_items
      FROM todos
      WHERE ${whereClause}
    `,
    values,
  );

  const totalItems =
    countResult.rows[0]?.total_items ?? 0;

  const limitPosition = values.length + 1;
  const offsetPosition = values.length + 2;

  const offset =
    (query.page - 1) * query.pageSize;

  const dataValues = [
    ...values,
    query.pageSize,
    offset,
  ];

  const sortColumn =
    query.sortBy === "createdAt"
      ? "created_at"
      : "due_date";

  const sortDirection =
    query.sortOrder === "asc"
      ? "ASC"
      : "DESC";

  const dataResult =
    await client.query<TodoDatabaseRow>(
      `
        SELECT ${TODO_COLUMNS}
        FROM todos
        WHERE ${whereClause}
        ORDER BY
          ${sortColumn} ${sortDirection}
          NULLS LAST,
          id ${sortDirection}
        LIMIT $${limitPosition}
        OFFSET $${offsetPosition}
      `,
      dataValues,
    );

  return {
    items: dataResult.rows.map(mapTodoRow),
    totalItems,
  };
}