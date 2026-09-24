import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  RegisteredAccount,
} from "@todo/contracts";

import type {
  PasswordHasher,
} from "../../../../security/password-hasher.js";

import type {
  RegistrationRepository,
} from "../registration.repository.interface.js";

import {
  RegistrationService,
} from "../registration.service.js";

interface TestDependencies {
  readonly repository:
    RegistrationRepository;

  readonly passwordHasher:
    PasswordHasher;

  readonly createAccountMock:
    ReturnType<
      typeof vi.fn<
        RegistrationRepository[
          "createAccount"
        ]
      >
    >;

  readonly hashMock:
    ReturnType<
      typeof vi.fn<
        PasswordHasher["hash"]
      >
    >;
}

function createDependencies():
  TestDependencies {
  const createAccountMock =
    vi.fn<
      RegistrationRepository[
        "createAccount"
      ]
    >();

  const hashMock =
    vi.fn<
      PasswordHasher["hash"]
    >();

  return {
    createAccountMock,
    hashMock,

    repository: {
      createAccount:
        createAccountMock,
    },

    passwordHasher: {
      hash: hashMock,
    },
  };
}

describe(
  "RegistrationService",
  () => {
    it(
      "hashes the password and creates an account",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashMock
          .mockResolvedValue(
            "$2b$12$hashed-password",
          );

        const account:
          RegisteredAccount = {
            id:
              "a95fd118-f777-4500-9ea9-7d1a650fdadb",
            email:
              "user@example.com",
            createdAt:
              "2026-09-21T08:30:00.000Z",
          };

        dependencies
          .createAccountMock
          .mockResolvedValue(account);

        const service =
          new RegistrationService(
            dependencies.repository,
            dependencies.passwordHasher,
          );

        const result =
          await service.register(
            {
              email:
                "User@Example.COM",
              password:
                "StrongPassword123!",
            },
            "42c06bb5-a32d-4da8-8050-ddc480972b20",
          );

        expect(
          dependencies.hashMock,
        ).toHaveBeenCalledOnce();

        expect(
          dependencies.hashMock,
        ).toHaveBeenCalledWith(
          "StrongPassword123!",
        );

        expect(
          dependencies.createAccountMock,
        ).toHaveBeenCalledOnce();

        expect(
          dependencies.createAccountMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            email:
              "user@example.com",

            passwordHash:
              "$2b$12$hashed-password",

            requestId:
              "42c06bb5-a32d-4da8-8050-ddc480972b20",
          }),
        );

        expect(result)
          .toEqual(account);
      },
    );

    it(
      "generates different IDs for the account and event",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashMock
          .mockResolvedValue(
            "$2b$12$hashed-password",
          );

        dependencies
          .createAccountMock
          .mockImplementation(
            (data) =>
              Promise.resolve({
                id: data.id,
                email: data.email,
                createdAt:
                  data.createdAt
                    .toISOString(),
              }),
          );

        const service =
          new RegistrationService(
            dependencies.repository,
            dependencies.passwordHasher,
          );

        await service.register(
          {
            email:
              "user@example.com",
            password:
              "StrongPassword123!",
          },
          "42c06bb5-a32d-4da8-8050-ddc480972b20",
        );

        const firstCall =
          dependencies
            .createAccountMock
            .mock
            .calls[0];

        expect(firstCall)
          .toBeDefined();

        const createData =
          firstCall?.[0];

        expect(createData)
          .toBeDefined();

        expect(createData?.id)
          .not
          .toBe(createData?.eventId);
      },
    );

    it(
      "normalizes the email before persistence",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashMock
          .mockResolvedValue(
            "$2b$12$hashed-password",
          );

        dependencies
          .createAccountMock
          .mockImplementation(
            (data) =>
              Promise.resolve({
                id: data.id,
                email: data.email,
                createdAt:
                  data.createdAt
                    .toISOString(),
              }),
          );

        const service =
          new RegistrationService(
            dependencies.repository,
            dependencies.passwordHasher,
          );

        await service.register(
          {
            email:
              "  User@Example.COM  ",
            password:
              "StrongPassword123!",
          },
          "42c06bb5-a32d-4da8-8050-ddc480972b20",
        );

        expect(
          dependencies.createAccountMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            email:
              "user@example.com",
          }),
        );
      },
    );

    it(
      "converts a PostgreSQL unique violation into a conflict",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashMock
          .mockResolvedValue(
            "$2b$12$hashed-password",
          );

        dependencies
          .createAccountMock
          .mockRejectedValue({
            code: "23505",
          });

        const service =
          new RegistrationService(
            dependencies.repository,
            dependencies.passwordHasher,
          );

        const operation =
          service.register(
            {
              email:
                "user@example.com",
              password:
                "StrongPassword123!",
            },
            "42c06bb5-a32d-4da8-8050-ddc480972b20",
          );

        await expect(operation)
          .rejects
          .toMatchObject({
            statusCode: 409,
            code:
              "EMAIL_ALREADY_REGISTERED",
            message:
              "An account with this email already exists",
          });
      },
    );

    it(
      "does not call the repository when hashing fails",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashMock
          .mockRejectedValue(
            new Error(
              "Hashing unavailable",
            ),
          );

        const service =
          new RegistrationService(
            dependencies.repository,
            dependencies.passwordHasher,
          );

        const operation =
          service.register(
            {
              email:
                "user@example.com",
              password:
                "StrongPassword123!",
            },
            "42c06bb5-a32d-4da8-8050-ddc480972b20",
          );

        await expect(operation)
          .rejects
          .toThrow(
            "Hashing unavailable",
          );

        expect(
          dependencies.createAccountMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "propagates unexpected repository errors",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .hashMock
          .mockResolvedValue(
            "$2b$12$hashed-password",
          );

        dependencies
          .createAccountMock
          .mockRejectedValue(
            new Error(
              "Database unavailable",
            ),
          );

        const service =
          new RegistrationService(
            dependencies.repository,
            dependencies.passwordHasher,
          );

        const operation =
          service.register(
            {
              email:
                "user@example.com",
              password:
                "StrongPassword123!",
            },
            "42c06bb5-a32d-4da8-8050-ddc480972b20",
          );

        await expect(operation)
          .rejects
          .toThrow(
            "Database unavailable",
          );
      },
    );
  },
);