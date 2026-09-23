import type {
  TodoResponse,
} from "./todo.types.js";

export interface GetTodoParams {
  readonly todoId: string;
}

export type GetTodoResponse =
  TodoResponse;