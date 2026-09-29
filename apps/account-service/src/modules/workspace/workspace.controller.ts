import type {
  RequestHandler,
} from "express";

import type {
  AddWorkspaceMemberRequest,
  ChangeWorkspaceMemberRoleRequest,
  CreateWorkspaceRequest,
  ListWorkspaceMembersResponse,
  WorkspaceMemberParams,
  WorkspaceIdParams,
  WorkspaceResponse,
} from "@todo/contracts";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  requireInternalIdentity,
} from "../../security/internal-identity.js";

import {
  getValidatedParams,
} from "../../middleware/validate-params.middleware.js";

import {
  workspaceService,
} from "./workspace.module.js";

function requireRequestId(): string {
  const requestId =
    getRequestId();

  if (requestId === undefined) {
    throw new AppError(
      500,
      "REQUEST_CONTEXT_UNAVAILABLE",
      "Request context is unavailable",
    );
  }

  return requestId;
}

export const createWorkspace:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(request);

    const body =
      request.body as
        CreateWorkspaceRequest;

    const workspace =
      await workspaceService.createWorkspace(
        body.name,
        identity.userId,
        requireRequestId(),
      );

    const responseBody:
      WorkspaceResponse = {
        data: {
          workspace,
        },
      };

    response
      .status(201)
      .json(responseBody);
  };

export const getWorkspace:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(request);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceIdParams;

    const workspace =
      await workspaceService.getWorkspace(
        params.workspaceId,
        identity.userId,
      );

    const responseBody:
      WorkspaceResponse = {
        data: {
          workspace,
        },
      };

    response
      .status(200)
      .json(responseBody);
  };

export const listWorkspaceMembers:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(request);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceIdParams;

    const members =
      await workspaceService.listMembers(
        params.workspaceId,
        identity.userId,
      );

    const responseBody:
      ListWorkspaceMembersResponse = {
        data: {
          members,
        },
      };

    response
      .status(200)
      .json(responseBody);
  };

export const addWorkspaceMember:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(request);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceIdParams;

    const body =
      request.body as
        AddWorkspaceMemberRequest;

    await workspaceService.addMember(
      params.workspaceId,
      identity.userId,
      body.userId,
      body.role,
      requireRequestId(),
    );

    response
      .status(204)
      .send();
  };

export const changeWorkspaceMemberRole:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(request);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceMemberParams;

    const body =
      request.body as
        ChangeWorkspaceMemberRoleRequest;

    await workspaceService.changeMemberRole(
      params.workspaceId,
      identity.userId,
      params.userId,
      body.role,
      requireRequestId(),
    );

    response
      .status(204)
      .send();
  };

export const removeWorkspaceMember:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(request);

    const params =
      getValidatedParams(
        response,
      ) as WorkspaceMemberParams;

    await workspaceService.removeMember(
      params.workspaceId,
      identity.userId,
      params.userId,
      requireRequestId(),
    );

    response
      .status(204)
      .send();
  };
