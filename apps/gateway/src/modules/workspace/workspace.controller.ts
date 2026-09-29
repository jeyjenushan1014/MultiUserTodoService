import type {
  RequestHandler,
} from "express";

import type {
  AddWorkspaceMemberRequest,
  ChangeWorkspaceMemberRoleRequest,
  CreateWorkspaceRequest,
  WorkspaceIdParams,
  WorkspaceMemberParams,
} from "@todo/contracts";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  addWorkspaceMember,
  changeWorkspaceMemberRole,
  createWorkspace,
  getWorkspace,
  listWorkspaceMembers,
  removeWorkspaceMember,
} from "../../clients/account-service.client.js";

import {
  getCallerIdentity,
} from "../../middleware/authenticate.middleware.js";

import {
  getValidatedParams,
} from "../../middleware/validate-params.middleware.js";

function requireRequestId(): string {
  const requestId =
    getRequestId();

  if (requestId === undefined) {
    throw new AppError(
      500,
      "REQUEST_CONTEXT_MISSING",
      "Request context is unavailable",
    );
  }

  return requestId;
}

export const createWorkspaceController:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      getCallerIdentity(response);

    const result =
      await createWorkspace(
        identity,
        request.body as
          CreateWorkspaceRequest,
        requireRequestId(),
      );

    response
      .status(201)
      .json(result);
  };

export const getWorkspaceController:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      getCallerIdentity(response);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceIdParams;

    const result =
      await getWorkspace(
        identity,
        params.workspaceId,
        requireRequestId(),
      );

    response
      .status(200)
      .json(result);
  };

export const listWorkspaceMembersController:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      getCallerIdentity(response);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceIdParams;

    const result =
      await listWorkspaceMembers(
        identity,
        params.workspaceId,
        requireRequestId(),
      );

    response
      .status(200)
      .json(result);
  };

export const addWorkspaceMemberController:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      getCallerIdentity(response);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceIdParams;

    await addWorkspaceMember(
      identity,
      params.workspaceId,
      request.body as
        AddWorkspaceMemberRequest,
      requireRequestId(),
    );

    response
      .status(204)
      .send();
  };

export const changeWorkspaceMemberRoleController:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      getCallerIdentity(response);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceMemberParams;

    await changeWorkspaceMemberRole(
      identity,
      params.workspaceId,
      params.userId,
      request.body as
        ChangeWorkspaceMemberRoleRequest,
      requireRequestId(),
    );

    response
      .status(204)
      .send();
  };

export const removeWorkspaceMemberController:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      getCallerIdentity(response);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceMemberParams;

    await removeWorkspaceMember(
      identity,
      params.workspaceId,
      params.userId,
      requireRequestId(),
    );

    response
      .status(204)
      .send();
  };
