import type { RequestHandler } from "express";

import  { AppError } from "@todo/common";

export const notFoundHandler: RequestHandler = (
  _request,
  _response,
  next,
) => {
  next(
    new AppError(
      404,
      "ROUTE_NOT_FOUND",
      "The requested route was not found",
    ),
  );
};