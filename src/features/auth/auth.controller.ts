
import type { RequestHandler } from "express";
import type { Credentials } from "./auth.types.js";
import * as authService from "./auth.service.js";

export const register: RequestHandler = async (
  request,
  response,
) => {
  const credentials = request.body as Credentials;

  const user = await authService.register(
    credentials.email,
    credentials.password,
  );

  response.status(201).json({
    data: user,
  });
};

