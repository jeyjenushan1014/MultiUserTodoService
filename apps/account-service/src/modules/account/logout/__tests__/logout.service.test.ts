import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  LogoutRepository,
} from "../logout.repository.interface.js";

import {
  LogoutService,
} from "../logout.service.js";

interface Dependencies {
  readonly repository:
    LogoutRepository;

  readonly revokeSessionMock:
    ReturnType<
      typeof vi.fn<
        LogoutRepository[
          "revokeSession"
        ]
      >
    >;

  readonly revokeAllSessionsMock:
    ReturnType<
      typeof vi.fn<
        LogoutRepository[
          "revokeAllSessions"
        ]
      >
    >;
}

function createDependencies():
  Dependencies {
  const revokeSessionMock =
    vi.fn<
      LogoutRepository[
        "revokeSession"
      ]
    >();

  const revokeAllSessionsMock =
    vi.fn<
      LogoutRepository[
        "revokeAllSessions"
      ]
    >();

  return {
    revokeSessionMock,
    revokeAllSessionsMock,

    repository: {
      revokeSession:
        revokeSessionMock,

      revokeAllSessions:
        revokeAllSessionsMock,
    },
  };
}

describe(
  "LogoutService",
  () => {
    it(
      "revokes the current session",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .revokeSessionMock
          .mockResolvedValue(true);

        const service =
          new LogoutService(
            dependencies.repository,
          );

        await service.logout(
          "user-id",
          "session-id",
        );

        expect(
          dependencies
            .revokeSessionMock,
        ).toHaveBeenCalledWith(
          "user-id",
          "session-id",
        );
      },
    );

    it(
      "remains idempotent when the session is already revoked",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .revokeSessionMock
          .mockResolvedValue(false);

        const service =
          new LogoutService(
            dependencies.repository,
          );

        await expect(
          service.logout(
            "user-id",
            "session-id",
          ),
        ).resolves.toBeUndefined();
      },
    );

    it(
      "revokes all user sessions",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .revokeAllSessionsMock
          .mockResolvedValue(3);

        const service =
          new LogoutService(
            dependencies.repository,
          );

        await service.logoutAll(
          "user-id",
        );

        expect(
          dependencies
            .revokeAllSessionsMock,
        ).toHaveBeenCalledWith(
          "user-id",
        );
      },
    );

    it(
      "propagates repository errors",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .revokeSessionMock
          .mockRejectedValue(
            new Error(
              "Database unavailable",
            ),
          );

        const service =
          new LogoutService(
            dependencies.repository,
          );

        await expect(
          service.logout(
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