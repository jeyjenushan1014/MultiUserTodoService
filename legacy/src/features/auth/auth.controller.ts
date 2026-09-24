
import type { RequestHandler } from "express";
import type { Credentials } from "./auth.types.js";
import * as authService from "./auth.service.js";
import { AuthenticatedRequest } from "../../middleware/authenticate.middleware.js";

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

export const login:RequestHandler = async (
  request,
  response
) => {
  const credentials = request.body as Credentials;

  const result=await authService.login(
    credentials.email,
    credentials.password
  );

  response.status(200).json({
    data: result,
  })
}

export const getCurrentUser: RequestHandler = async (
  request: AuthenticatedRequest,
  response,
) => {
  const user = await authService.getCurrentUser(
    request.authenticatedUser!.id,
  );

  response.status(200).json({
    data: user,
  });
};


