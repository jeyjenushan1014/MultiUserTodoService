import { PoolClient } from "pg";
import { database } from "../../config/database";
import { CreateTodoInput, Todo, TodoDatabaseRow, ListTodoQuery, UpdateTodoInput } from "./todo.types";

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
export async function findTodoById(
  ownerId: string,
  todoId: string,
): Promise<Todo | undefined> {
  const result =
    await database.query<TodoDatabaseRow>(
      `
        SELECT ${TODO_COLUMNS}
        FROM todos
        WHERE id = $1
          AND owner_id = $2
          AND deleted_at IS NULL
      `,
      [todoId, ownerId],
    );

  const row = result.rows[0];

  return row
    ? mapTodoRow(row)
    : undefined;
}

interface UpdateField {
  inputName: keyof UpdateTodoInput;
  columnName: string;
}

const UPDATE_FIELDS: UpdateField[] = [
  {
    inputName: "title",
    columnName: "title",
  },
  {
    inputName: "description",
    columnName: "description",
  },
  {
    inputName: "state",
    columnName: "state",
  },
  {
    inputName: "dueDate",
    columnName: "due_date",
  },
];

export async function updateTodo(
  ownerId: string,
  todoId: string,
  input: UpdateTodoInput,
): Promise<Todo | undefined> {
  const values: unknown[] = [
    todoId,
    ownerId,
  ];

  const setClauses: string[] = [];

  for (const field of UPDATE_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(
        input,
        field.inputName,
      )
    ) {
      values.push(input[field.inputName]);

      setClauses.push(
        `${field.columnName} = $${values.length}`,
      );
    }
  }

  const result =
    await database.query<TodoDatabaseRow>(
      `
        UPDATE todos
        SET
          ${setClauses.join(", ")},
          updated_at = now()
        WHERE id = $1
          AND owner_id = $2
          AND deleted_at IS NULL
        RETURNING ${TODO_COLUMNS}
      `,
      values,
    );

  const row = result.rows[0];

  return row
    ? mapTodoRow(row)
    : undefined;
}