import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  PasswordHasher,
} from "../../../../security/password-hasher.js";

import type {
  PasswordResetRepository,
} from "../password-reset.repository.interface.js";

import {
  PasswordResetService,
} from "../password-reset.service.js";

interface Dependencies {
  readonly findActiveUserByEmailMock:
    ReturnType<
      typeof vi.fn<
        PasswordResetRepository[
          "findActiveUserByEmail"
        ]
      >
    >;

  readonly createPasswordResetMock:
    ReturnType<
      typeof vi.fn<
        PasswordResetRepository[
          "createPasswordReset"
        ]
      >
    >;

  readonly completePasswordResetMock:
    ReturnType<
      typeof vi.fn<
        PasswordResetRepository[
          "completePasswordReset"
        ]
      >
    >;

  readonly hashPasswordMock:
    ReturnType<
      typeof vi.fn<
        PasswordHasher["hash"]
      >
    >;

  readonly service:
    PasswordResetService;
}

function createDependencies():
Dependencies {
  const findActiveUserByEmailMock =
    vi.fn<
      PasswordResetRepository[
        "findActiveUserByEmail"
      ]
    >();

  const createPasswordResetMock =
    vi.fn<
      PasswordResetRepository[
        "createPasswordReset"
      ]
    >();

  const completePasswordResetMock =
    vi.fn<
      PasswordResetRepository[
        "completePasswordReset"
      ]
    >();

  const hashPasswordMock =
    vi.fn<
      PasswordHasher["hash"]
    >();

  const repository:
    PasswordResetRepository = {
      findActiveUserByEmail:
        findActiveUserByEmailMock,

      createPasswordReset:
        createPasswordResetMock,

      completePasswordReset:
        completePasswordResetMock,
    };

  const passwordHasher:
    PasswordHasher = {
      hash:
        hashPasswordMock,
    };

  return {
    findActiveUserByEmailMock,
    createPasswordResetMock,
    completePasswordResetMock,
    hashPasswordMock,

    service:
      new PasswordResetService(
        repository,
        passwordHasher,
      ),
  };
}

describe(
  "PasswordResetService",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(
      "completes a password reset",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashPasswordMock
          .mockResolvedValue(
            "new-password-hash",
          );

        dependencies
          .completePasswordResetMock
          .mockResolvedValue({
            completed: true,
          });

        await dependencies
          .service
          .confirmReset({
            token:
              "a-secure-password-reset-token-containing-more-than-32-characters",
            newPassword:
              "StrongPassword123!",
            requestId:
              "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
          });

        expect(
          dependencies
            .hashPasswordMock,
        ).toHaveBeenCalledWith(
          "StrongPassword123!",
        );

        expect(
          dependencies
            .completePasswordResetMock,
        ).toHaveBeenCalledTimes(1);

        const firstCall =
          dependencies
            .completePasswordResetMock
            .mock.calls[0];

        expect(firstCall).toBeDefined();

        const resetData =
          firstCall?.[0];

        expect(
          resetData?.tokenHash,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          resetData?.newPasswordHash,
        ).toBe(
          "new-password-hash",
        );

        expect(
          resetData?.requestId,
        ).toBe(
          "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
        );
      },
    );

    it(
      "rejects an invalid or expired token",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashPasswordMock
          .mockResolvedValue(
            "new-password-hash",
          );

        dependencies
          .completePasswordResetMock
          .mockResolvedValue({
            completed: false,
          });

        await expect(
          dependencies
            .service
            .confirmReset({
              token:
                "an-invalid-reset-token-containing-more-than-32-characters",
              newPassword:
                "StrongPassword123!",
              requestId:
                "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
            }),
        ).rejects.toMatchObject({
          statusCode: 400,
          code:
            "INVALID_PASSWORD_RESET_TOKEN",
        });
      },
    );

    it(
      "propagates password hashing failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashPasswordMock
          .mockRejectedValue(
            new Error(
              "password hashing failed",
            ),
          );

        await expect(
          dependencies
            .service
            .confirmReset({
              token:
                "a-secure-password-reset-token-containing-more-than-32-characters",
              newPassword:
                "StrongPassword123!",
              requestId:
                "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
            }),
        ).rejects.toThrow(
          "password hashing failed",
        );

        expect(
          dependencies
            .completePasswordResetMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "propagates transactional database failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashPasswordMock
          .mockResolvedValue(
            "new-password-hash",
          );

        dependencies
          .completePasswordResetMock
          .mockRejectedValue(
            new Error(
              "transaction failed",
            ),
          );

        await expect(
          dependencies
            .service
            .confirmReset({
              token:
                "a-secure-password-reset-token-containing-more-than-32-characters",
              newPassword:
                "StrongPassword123!",
              requestId:
                "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
            }),
        ).rejects.toThrow(
          "transaction failed",
        );
      },
    );
  },
);