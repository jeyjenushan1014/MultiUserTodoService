import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AppError,
} from "../errors/app-error.js";

describe("AppError", () => {
  it("stores the expected error information", () => {
    const error = new AppError(
      404,
      "TODO_NOT_FOUND",
      "Todo was not found",
      [
        {
          field: "params.id",
          message: "Todo does not exist",
        },
      ],
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe(
      "TODO_NOT_FOUND",
    );
    expect(error.message).toBe(
      "Todo was not found",
    );
    expect(error.details).toEqual([
      {
        field: "params.id",
        message: "Todo does not exist",
      },
    ]);
  });

  it("supports an error without details", () => {
    const error = new AppError(
      401,
      "UNAUTHORIZED",
      "Authentication is required",
    );

    expect(error.details).toBeUndefined();
  });
});