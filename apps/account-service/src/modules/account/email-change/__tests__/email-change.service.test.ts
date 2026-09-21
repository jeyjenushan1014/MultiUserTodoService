import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  PasswordVerifier,
} from "../../../../security/password-hasher.js";

import type {
  EmailChangeRepository,
} from "../email-change.repository.interface.js";

import {
  EmailChangeService,
} from "../email-change.service.js";

interface TestDependencies {
  readonly findCredentialMock: ReturnType<
    typeof vi.fn<
      EmailChangeRepository[
        "findActiveCredential"
      ]
    >
  >;

  readonly changeEmailMock: ReturnType<
    typeof vi.fn<
      EmailChangeRepository[
        "changeEmail"
      ]
    >
  >;

  readonly verifyMock: ReturnType<
    typeof vi.fn<
      PasswordVerifier["verify"]
    >
  >;

  readonly repository: EmailChangeRepository;

  readonly passwordVerifier: PasswordVerifier;
}

function createDependencies():
  TestDependencies {
  const findCredentialMock =
    vi.fn<
      EmailChangeRepository[
        "findActiveCredential"
      ]
    >();

  const changeEmailMock =
    vi.fn<
      EmailChangeRepository[
        "changeEmail"
      ]
    >();

  const verifyMock =
    vi.fn<
      PasswordVerifier["verify"]
    >();

  return {
    findCredentialMock,
    changeEmailMock,
    verifyMock,

    repository: {
      findActiveCredential:
        findCredentialMock,
      changeEmail:
        changeEmailMock,
    },

    passwordVerifier: {
      verify: verifyMock,
    },
  };
}

describe(
  "EmailChangeService",
  () => {
    it(
      "changes the email after password verification",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findCredentialMock
          .mockResolvedValue({
            id: "user-id",
            email:
              "old@example.com",
            password_hash:
              "stored-hash",
          });

        dependencies.verifyMock
          .mockResolvedValue(true);

        dependencies.changeEmailMock
          .mockResolvedValue({
            id: "user-id",
            email:
              "new@example.com",
            updated_at:
              new Date(
                "2026-09-21T10:00:00.000Z",
              ),
          });

        const service =
          new EmailChangeService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        const result =
          await service.changeEmail(
            "user-id",
            "session-id",
            "request-id",
            {
              email:
                "New@Example.COM",
              currentPassword:
                "password",
            },
          );

        expect(result).toEqual({
          data: {
            user: {
              id: "user-id",
              email:
                "new@example.com",
              updatedAt:
                "2026-09-21T10:00:00.000Z",
            },
            reauthenticationRequired:
              true,
          },
        });
      },
    );

    it(
      "rejects an invalid session",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findCredentialMock
          .mockResolvedValue(
            undefined,
          );

        const service =
          new EmailChangeService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await expect(
          service.changeEmail(
            "user-id",
            "session-id",
            "request-id",
            {
              email:
                "new@example.com",
              currentPassword:
                "password",
            },
          ),
        ).rejects.toMatchObject({
          statusCode: 401,
          code:
            "SESSION_INVALID",
        });
      },
    );

    it(
      "rejects an incorrect current password",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findCredentialMock
          .mockResolvedValue({
            id: "user-id",
            email:
              "old@example.com",
            password_hash:
              "stored-hash",
          });

        dependencies.verifyMock
          .mockResolvedValue(false);

        const service =
          new EmailChangeService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await expect(
          service.changeEmail(
            "user-id",
            "session-id",
            "request-id",
            {
              email:
                "new@example.com",
              currentPassword:
                "wrong-password",
            },
          ),
        ).rejects.toMatchObject({
          statusCode: 401,
          code:
            "INVALID_CREDENTIALS",
        });

        expect(
          dependencies.changeEmailMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects the current email",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findCredentialMock
          .mockResolvedValue({
            id: "user-id",
            email:
              "same@example.com",
            password_hash:
              "stored-hash",
          });

        dependencies.verifyMock
          .mockResolvedValue(true);

        const service =
          new EmailChangeService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await expect(
          service.changeEmail(
            "user-id",
            "session-id",
            "request-id",
            {
              email:
                "SAME@example.com",
              currentPassword:
                "password",
            },
          ),
        ).rejects.toMatchObject({
          statusCode: 409,
          code: "EMAIL_UNCHANGED",
        });

        expect(
          dependencies.changeEmailMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "translates a duplicate email error",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findCredentialMock
          .mockResolvedValue({
            id: "user-id",
            email:
              "old@example.com",
            password_hash:
              "stored-hash",
          });

        dependencies.verifyMock
          .mockResolvedValue(true);

        dependencies.changeEmailMock
          .mockRejectedValue({
            code: "23505",
          });

        const service =
          new EmailChangeService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await expect(
          service.changeEmail(
            "user-id",
            "session-id",
            "request-id",
            {
              email:
                "existing@example.com",
              currentPassword:
                "password",
            },
          ),
        ).rejects.toMatchObject({
          statusCode: 409,
          code:
            "EMAIL_ALREADY_REGISTERED",
        });
      },
    );
  },
);