import { RequestHandler } from "express";
import type { AuthenticatedRequest } from "../../middleware/authenticate.middleware.js";
import type { CreateTodoInput, ListTodoQuery, UpdateTodoInput } from "./todo.types.js";
import * as todoService from "./todo.service.js";


function getAuthenticatedUserId(
  request: AuthenticatedRequest,
): string {
  return request.authenticatedUser!.id;
}

function getTodoId(
  request: AuthenticatedRequest,
): string {
  const id = request.params.id;

  if (typeof id !== "string") {
    throw new Error(
      "Validated TODO ID is unavailable",
    );
  }

  return id;
}


export const createTodo: RequestHandler = async (
  request: AuthenticatedRequest,
  response,
) => {
  const input =
    request.body as CreateTodoInput;

  const todo = await todoService.createTodo(
    getAuthenticatedUserId(request),
    input,
  );


  response.status(201).json({
    data: todo,
  });
};

export const listTodos: RequestHandler = async (
  request: AuthenticatedRequest,
  response,
) => {

  const query =
    request.query as unknown as ListTodoQuery;

  const result = await todoService.listTodos(
    getAuthenticatedUserId(request),
    query,
  );

  response.status(200).json({
    data: result,
  });
};

export const getTodoById: RequestHandler = async (
  request: AuthenticatedRequest,
  response,
) => {
  const todo = await todoService.getTodoById(
    getAuthenticatedUserId(request),
    getTodoId(request),
  );

  response.status(200).json({
    data: todo,
  });
};

export const updateTodo: RequestHandler = async (
  request: AuthenticatedRequest,
  response,
) => {
  const input =
    request.body as UpdateTodoInput;

  const todo = await todoService.updateTodo(
    getAuthenticatedUserId(request),
    getTodoId(request),
    input,
  );

  response.status(200).json({
    data: todo,
  });
};

export const deleteTodo: RequestHandler = async (
  request: AuthenticatedRequest,
  response,
) => {
  await todoService.deleteTodo(
    getAuthenticatedUserId(request),
    getTodoId(request),
  );

  response.status(204).send();
};