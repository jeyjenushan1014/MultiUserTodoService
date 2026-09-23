import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AppError,
} from "@todo/common";

import type {
  AccountLookupRepository,
} from "../account-lookup.repository.interface.js";

import {
  AccountLookupService,
} from "../account-lookup.service.js";

interface RepositoryFixture {
  readonly repository:
    AccountLookupRepository;

  readonly findByEmailMock:
    ReturnType<
      typeof vi.fn<
        AccountLookupRepository[
          "findByEmail"
        ]
      >
    >;
}

function createRepositoryFixture():
  RepositoryFixture {
  const findByEmailMock =
    vi.fn<
      AccountLookupRepository[
        "findByEmail"
      ]
    >();

  const repository:
    AccountLookupRepository = {
      findByEmail:
        (
          email,
        ) =>
          findByEmailMock(
            email,
          ),
    };

  return {
    repository,
    findByEmailMock,
  };
}

describe(
  "AccountLookupService",
  () => {
    it(
      "returns a resolved account",
      async () => {
        const {
          repository,
          findByEmailMock,
        } =
          createRepositoryFixture();

        findByEmailMock
          .mockResolvedValueOnce({
            id:
              "29159e6a-3dc0-4415-ac22-d75aec4b3069",

            email:
              "recipient@example.com",
          });

        const service =
          new AccountLookupService(
            repository,
          );

        const result =
          await service.execute(
            "recipient@example.com",
          );

        expect(
          result,
        ).toEqual({
          data: {
            account: {
              id:
                "29159e6a-3dc0-4415-ac22-d75aec4b3069",

              email:
                "recipient@example.com",
            },
          },
        });

        expect(
          findByEmailMock,
        ).toHaveBeenCalledWith(
          "recipient@example.com",
        );
      },
    );

    it(
      "throws ACCOUNT_NOT_FOUND when the email does not exist",
      async () => {
        const {
          repository,
          findByEmailMock,
        } =
          createRepositoryFixture();

        findByEmailMock
          .mockResolvedValueOnce(
            undefined,
          );

        const service =
          new AccountLookupService(
            repository,
          );

        try {
          await service.execute(
            "missing@example.com",
          );

          throw new Error(
            "Expected lookup to fail",
          );
        } catch (error) {
          expect(
            error,
          ).toBeInstanceOf(
            AppError,
          );

          if (
            error instanceof AppError
          ) {
            expect(
              error.statusCode,
            ).toBe(
              404,
            );

            expect(
              error.code,
            ).toBe(
              "ACCOUNT_NOT_FOUND",
            );
          }
        }
      },
    );

    it(
      "propagates repository failures",
      async () => {
        const {
          repository,
          findByEmailMock,
        } =
          createRepositoryFixture();

        const databaseError =
          new Error(
            "Database unavailable",
          );

        findByEmailMock
          .mockRejectedValueOnce(
            databaseError,
          );

        const service =
          new AccountLookupService(
            repository,
          );

        await expect(
          service.execute(
            "recipient@example.com",
          ),
        ).rejects.toBe(
          databaseError,
        );
      },
    );
  },
);