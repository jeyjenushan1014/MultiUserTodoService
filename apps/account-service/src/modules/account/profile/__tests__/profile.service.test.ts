import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ProfileRepository,
} from "../profile.repository.interface.js";

import {
  ProfileService,
} from "../profile.service.js";

interface TestDependencies {
  readonly repository:
    ProfileRepository;

  readonly findActiveAccountMock:
    ReturnType<
      typeof vi.fn<
        ProfileRepository[
          "findActiveAccount"
        ]
      >
    >;
}

function createDependencies():
  TestDependencies {
  const findActiveAccountMock =
    vi.fn<
      ProfileRepository[
        "findActiveAccount"
      ]
    >();

  return {
    findActiveAccountMock,

    repository: {
      findActiveAccount:
        findActiveAccountMock,
    },
  };
}

describe(
  "ProfileService",
  () => {
    it(
      "returns the current user for an active session",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findActiveAccountMock
          .mockResolvedValue({
            id: "user-id",
            email:
              "user@example.com",

            created_at:
              new Date(
                "2026-09-21T08:00:00.000Z",
              ),

            updated_at:
              new Date(
                "2026-09-21T09:00:00.000Z",
              ),
          });

        const service =
          new ProfileService(
            dependencies.repository,
          );

        const result =
          await service
            .getCurrentAccount(
              "user-id",
              "session-id",
            );

        expect(result).toEqual({
          id: "user-id",
          email:
            "user@example.com",
          createdAt:
            "2026-09-21T08:00:00.000Z",
          updatedAt:
            "2026-09-21T09:00:00.000Z",
        });

        expect(
          dependencies
            .findActiveAccountMock,
        ).toHaveBeenCalledWith(
          "user-id",
          "session-id",
        );
      },
    );

    it(
      "rejects a missing session",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findActiveAccountMock
          .mockResolvedValue(
            undefined,
          );

        const service =
          new ProfileService(
            dependencies.repository,
          );

        await expect(
          service.getCurrentAccount(
            "user-id",
            "missing-session",
          ),
        ).rejects.toMatchObject({
          statusCode: 401,
          code:
            "SESSION_INVALID",
        });
      },
    );

    it(
      "rejects a revoked session",
      async () => {
        const dependencies =
          createDependencies();

        /*
         * The repository returns undefined when
         * revoked_at is not null.
         */
        dependencies
          .findActiveAccountMock
          .mockResolvedValue(
            undefined,
          );

        const service =
          new ProfileService(
            dependencies.repository,
          );

        await expect(
          service.getCurrentAccount(
            "user-id",
            "revoked-session",
          ),
        ).rejects.toMatchObject({
          statusCode: 401,
          code:
            "SESSION_INVALID",
        });
      },
    );

    it(
      "propagates repository errors",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findActiveAccountMock
          .mockRejectedValue(
            new Error(
              "Database unavailable",
            ),
          );

        const service =
          new ProfileService(
            dependencies.repository,
          );

        await expect(
          service.getCurrentAccount(
            "user-id",
            "session-id",
          ),
        ).rejects.toThrow(
          "Database unavailable",
        );
      },
    );
  },
);