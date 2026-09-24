/*
This file checks the authentication of incoming requests in an Express.js application.
*/


import type {
  Request,
  RequestHandler,
} from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../shared/app-error.js";

export interface AuthenticatedRequest extends Request {
  authenticatedUser?: {
    id: string;
    email: string;
  };
}

export const authenticate: RequestHandler = (
  request: AuthenticatedRequest,
  _response,
  next,
) => {
  const authorization =
    request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(
      new AppError(
        401,
        "UNAUTHENTICATED",
        "A valid access token is required",
      ),
    );

    return;
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(
      token,
      env.JWT_SECRET,
      {
        algorithms: ["HS256"],
      },
    );

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string"
    ) {
      throw new Error("Required claims are missing");
    }

    request.authenticatedUser = {
      id: payload.sub,
      email: payload.email,
    };

    next();
  } catch {
    next(
      new AppError(
        401,
        "UNAUTHENTICATED",
        "A valid access token is required",
      ),
    );
  }
};