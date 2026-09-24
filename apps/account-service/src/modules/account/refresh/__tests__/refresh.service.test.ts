import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  hashOpaqueToken,
} from "@todo/common";

import {
  createAccessToken,
} from "../../../../security/access-token.service.js";

import type {
  RefreshRepository,
} from "../refresh.repository.interface.js";

import {
  RefreshService,
} from "../refresh.service.js";

vi.mock(
  "../../../../security/access-token.service.js",
  () => ({
    createAccessToken:
      vi.fn(),
  }),
);

interface TestDependencies {
  readonly repository:
    RefreshRepository;

  readonly rotateMock:
    ReturnType<
      typeof vi.fn<
        RefreshRepository[
          "rotateRefreshToken"
        ]
      >
    >;
}

function createDependencies():
  TestDependencies {
  const rotateMock =
    vi.fn<
      RefreshRepository[
        "rotateRefreshToken"
      ]
    >();

  return {
    rotateMock,

    repository: {
      rotateRefreshToken:
        rotateMock,
    },
  };
}

const rawToken =
  "a".repeat(43);

describe(
  "RefreshService",
  () => {
    beforeEach(() => {
      vi.mocked(
        createAccessToken,
      ).mockReset();
    });

    it(
      "rotates a valid refresh token",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.rotateMock
          .mockResolvedValue({
            status: "rotated",

            session: {
              userId:
                "a95fd118-f777-4500-9ea9-7d1a650fdadb",

              sessionId:
                "29686b93-e275-428d-a7ef-cd86267bb53f",

              email:
                "user@example.com",
            },
          });

        vi.mocked(
          createAccessToken,
        ).mockResolvedValue(
          "new-access-token",
        );

        const service =
          new RefreshService(
            dependencies.repository,
          );

        const result =
          await service.refresh({
            refreshToken:
              rawToken,
          });

        expect(
          result.data.accessToken,
        ).toBe(
          "new-access-token",
        );

        expect(
          result.data.refreshToken,
        ).not.toBe(rawToken);

        expect(
          result.data.refreshToken,
        ).not.toHaveLength(0);
      },
    );

    it(
      "hashes the submitted and replacement tokens",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.rotateMock
          .mockResolvedValue({
            status: "rotated",

            session: {
              userId:
                "a95fd118-f777-4500-9ea9-7d1a650fdadb",

              sessionId:
                "29686b93-e275-428d-a7ef-cd86267bb53f",

              email:
                "user@example.com",
            },
          });

        vi.mocked(
          createAccessToken,
        ).mockResolvedValue(
          "new-access-token",
        );

        const service =
          new RefreshService(
            dependencies.repository,
          );

        const result =
          await service.refresh({
            refreshToken:
              rawToken,
          });

        const call =
          dependencies
            .rotateMock
            .mock
            .calls[0];

        if (call === undefined) {
          throw new Error(
            "Expected rotation to be called",
          );
        }

        const rotationData =
          call[0];

        expect(
          rotationData
            .currentTokenHash,
        ).toBe(
          hashOpaqueToken(rawToken),
        );

        expect(
          rotationData
            .nextTokenHash,
        ).toBe(
          hashOpaqueToken(
            result.data.refreshToken,
          ),
        );

        expect(
          rotationData.nextTokenHash,
        ).not.toBe(
          result.data.refreshToken,
        );
      },
    );

    it(
      "creates an access token for the rotated session",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.rotateMock
          .mockResolvedValue({
            status: "rotated",

            session: {
              userId: "user-id",
              sessionId:
                "session-id",
              email:
                "user@example.com",
            },
          });

        vi.mocked(
          createAccessToken,
        ).mockResolvedValue(
          "new-access-token",
        );

        const service =
          new RefreshService(
            dependencies.repository,
          );

        await service.refresh({
          refreshToken:
            rawToken,
        });

        const call =
          vi
            .mocked(createAccessToken)
            .mock
            .calls[0];

        if (call === undefined) {
          throw new Error(
            "Expected access-token creation",
          );
        }

        expect(call[0]).toEqual({
          userId: "user-id",
          sessionId: "session-id",
          email:
            "user@example.com",
        });
      },
    );

    it(
      "rejects an invalid or expired token",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.rotateMock
          .mockResolvedValue({
            status: "invalid",
          });

        const service =
          new RefreshService(
            dependencies.repository,
          );

        await expect(
          service.refresh({
            refreshToken:
              rawToken,
          }),
        ).rejects.toMatchObject({
          statusCode: 401,
          code:
            "INVALID_REFRESH_TOKEN",
        });

        expect(
          createAccessToken,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects a reused token",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.rotateMock
          .mockResolvedValue({
            status: "reused",
            sessionId:
              "session-id",
            userId:
              "user-id",
          });

        const service =
          new RefreshService(
            dependencies.repository,
          );

        await expect(
          service.refresh({
            refreshToken:
              rawToken,
          }),
        ).rejects.toMatchObject({
          statusCode: 401,
          code:
            "INVALID_REFRESH_TOKEN",
        });

        expect(
          createAccessToken,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "propagates repository errors",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.rotateMock
          .mockRejectedValue(
            new Error(
              "Database unavailable",
            ),
          );

        const service =
          new RefreshService(
            dependencies.repository,
          );

        await expect(
          service.refresh({
            refreshToken:
              rawToken,
          }),
        ).rejects.toThrow(
          "Database unavailable",
        );
      },
    );
  },
);