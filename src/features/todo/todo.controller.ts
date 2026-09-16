import { RequestHandler } from "express";
import { AuthenticatedRequest } from "../../middleware/authenticate.middleware";
import { CreateTodoInput } from "./todo.types";
import * as todoService from "./todo.service"


function getAuthenticatedUserId(
  request: AuthenticatedRequest,
): string {
  return request.authenticatedUser!.id;
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