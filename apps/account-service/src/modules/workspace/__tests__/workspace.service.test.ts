import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  WorkspaceRepository,
} from "../workspace.repository.interface.js";

import {
  WorkspaceService,
} from "../workspace.service.js";

function createRepositoryMock(
  overrides:
    Partial<WorkspaceRepository> = {},
): WorkspaceRepository {
  return {
    createWorkspace: vi.fn(),
    findWorkspaceForActor: vi.fn(),
    listMembers: vi.fn(),
    addMember: vi.fn(),
    changeMemberRole: vi.fn(),
    removeMember: vi.fn(),
    ...overrides,
  };
}

describe(
  "WorkspaceService",
  () => {
    it(
      "creates a workspace and returns it",
      async () => {
        const repository =
          createRepositoryMock({
            createWorkspace:
              vi.fn().mockResolvedValue({
                id: "workspace-id",
                name: "Engineering",
                createdBy: "creator-id",
                createdAt:
                  "2026-09-29T10:00:00.000Z",
              }),
          });

        const service =
          new WorkspaceService(repository);

        const result =
          await service.createWorkspace(
            "Engineering",
            "creator-id",
            "request-id",
          );

        expect(result).toEqual({
          id: "workspace-id",
          name: "Engineering",
          createdBy: "creator-id",
          createdAt:
            "2026-09-29T10:00:00.000Z",
        });
      },
    );

    it(
      "throws a 404 when the workspace lookup is not-found",
      async () => {
        const repository =
          createRepositoryMock({
            findWorkspaceForActor:
              vi.fn().mockResolvedValue({
                status: "not-found",
              }),
          });

        const service =
          new WorkspaceService(repository);

        await expect(
          service.getWorkspace(
            "workspace-id",
            "outsider-id",
          ),
        ).rejects.toMatchObject({
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
        });
      },
    );

    it(
      "throws a 403 when adding a member is forbidden",
      async () => {
        const repository =
          createRepositoryMock({
            addMember:
              vi.fn().mockResolvedValue(
                "forbidden",
              ),
          });

        const service =
          new WorkspaceService(repository);

        await expect(
          service.addMember(
            "workspace-id",
            "actor-id",
            "target-id",
            "editor",
            "request-id",
          ),
        ).rejects.toMatchObject({
          statusCode: 403,
          code: "WORKSPACE_ACTION_FORBIDDEN",
        });
      },
    );

    it(
      "throws a 403 when a caller attempts a self-change",
      async () => {
        const repository =
          createRepositoryMock({
            changeMemberRole:
              vi.fn().mockResolvedValue(
                "self-change",
              ),
          });

        const service =
          new WorkspaceService(repository);

        await expect(
          service.changeMemberRole(
            "workspace-id",
            "actor-id",
            "actor-id",
            "viewer",
            "request-id",
          ),
        ).rejects.toMatchObject({
          statusCode: 403,
          code: "WORKSPACE_SELF_CHANGE_FORBIDDEN",
        });
      },
    );

    it(
      "throws a 409 when removing the last administrator",
      async () => {
        const repository =
          createRepositoryMock({
            removeMember:
              vi.fn().mockResolvedValue(
                "last-administrator",
              ),
          });

        const service =
          new WorkspaceService(repository);

        await expect(
          service.removeMember(
            "workspace-id",
            "actor-id",
            "target-id",
            "request-id",
          ),
        ).rejects.toMatchObject({
          statusCode: 409,
          code: "WORKSPACE_LAST_ADMINISTRATOR",
        });
      },
    );

    it(
      "lists members when the lookup is found",
      async () => {
        const repository =
          createRepositoryMock({
            listMembers:
              vi.fn().mockResolvedValue({
                status: "found",
                members: [
                  {
                    userId: "creator-id",
                    role: "administrator",
                  },
                ],
              }),
          });

        const service =
          new WorkspaceService(repository);

        const result =
          await service.listMembers(
            "workspace-id",
            "creator-id",
          );

        expect(result).toEqual([
          {
            userId: "creator-id",
            role: "administrator",
          },
        ]);
      },
    );
  },
);
