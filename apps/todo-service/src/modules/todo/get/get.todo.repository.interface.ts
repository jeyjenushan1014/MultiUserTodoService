import type {
  GetTodoResponse,
} from "@todo/contracts";

export interface FindAccessibleTodoParameters {
  readonly todoId:
    string;

  readonly callerId:
    string;
}

export interface GetTodoRepository {
  findAccessibleById(
    parameters:
      FindAccessibleTodoParameters,
  ): Promise<
    GetTodoResponse | undefined
  >;
}