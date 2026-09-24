import type {
  RequestHandler,
} from "express";

import type {
  LoginInput,
} from "./login.validation.js";

import type {
  LoginService,
} from "./login.service.js";

export function createLoginController(
  loginService: LoginService,
): RequestHandler {
  return async (
    request,
    response,
  ): Promise<void> => {
    const result =
      await loginService.login(
        request.body as LoginInput,
      );

    response
      .status(200)
      .json(result);
  };
}