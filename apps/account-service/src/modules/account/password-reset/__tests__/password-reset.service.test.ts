import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  PasswordResetRepository,
} from "../password-reset.repository.interface.js";

import {
  PasswordResetService,
} from "../password-reset.service.js";

interface TestDependencies {
  readonly findActiveUserByEmailMock:
    ReturnType<typeof vi.fn>;

  readonly createPasswordResetMock:
    ReturnType<typeof vi.fn>;

  readonly repository:
    PasswordResetRepository;

  readonly service:
    PasswordResetService;
}

function createDependencies():
TestDependencies {
  const findActiveUserByEmailMock =
    vi.fn();

  const createPasswordResetMock =
    vi.fn();

  const repository:
    PasswordResetRepository = {
      findActiveUserByEmail:
        findActiveUserByEmailMock,

      createPasswordReset:
        createPasswordResetMock,
    };

  return {
    findActiveUserByEmailMock,
    createPasswordResetMock,
    repository,
    service:
      new PasswordResetService(
        repository,
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
      "creates a reset request for an existing user",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findActiveUserByEmailMock
          .mockResolvedValue({
            id:
              "11da4df1-b840-4f1b-a6e0-e191b65c46df",
            email:
              "user@example.com",
          });

        dependencies
          .createPasswordResetMock
          .mockResolvedValue(undefined);

        const result =
          await dependencies
            .service
            .requestReset({
              email:
                " USER@EXAMPLE.COM ",
              requestId:
                "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
            });

        expect(result).toEqual({
          message:
            "If an account exists for this email, password reset instructions will be sent",
        });

        expect(
          dependencies
            .findActiveUserByEmailMock,
        ).toHaveBeenCalledWith(
          "user@example.com",
        );

        expect(
          dependencies
            .createPasswordResetMock,
        ).toHaveBeenCalledTimes(1);

        const firstCall =
          dependencies
            .createPasswordResetMock
            .mock.calls[0];

        expect(firstCall).toBeDefined();

        const resetData =
          firstCall?.[0] as
            | {
                tokenHash: string;
                resetToken: string;
                userId: string;
                requestId: string;
              }
            | undefined;

        expect(resetData).toBeDefined();
        expect(
          resetData?.tokenHash,
        ).toMatch(/^[a-f0-9]{64}$/);

        expect(
          resetData?.resetToken,
        ).not.toBe(
          resetData?.tokenHash,
        );

        expect(
          resetData?.userId,
        ).toBe(
          "11da4df1-b840-4f1b-a6e0-e191b65c46df",
        );
      },
    );

    it(
      "returns the generic response when the user does not exist",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findActiveUserByEmailMock
          .mockResolvedValue(undefined);

        const result =
          await dependencies
            .service
            .requestReset({
              email:
                "missing@example.com",
              requestId:
                "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
            });

        expect(result).toEqual({
          message:
            "If an account exists for this email, password reset instructions will be sent",
        });

        expect(
          dependencies
            .createPasswordResetMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not hide database failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findActiveUserByEmailMock
          .mockRejectedValue(
            new Error(
              "database unavailable",
            ),
          );

        await expect(
          dependencies
            .service
            .requestReset({
              email:
                "user@example.com",
              requestId:
                "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
            }),
        ).rejects.toThrow(
          "database unavailable",
        );

        expect(
          dependencies
            .createPasswordResetMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not report success when transactional persistence fails",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findActiveUserByEmailMock
          .mockResolvedValue({
            id:
              "11da4df1-b840-4f1b-a6e0-e191b65c46df",
            email:
              "user@example.com",
          });

        dependencies
          .createPasswordResetMock
          .mockRejectedValue(
            new Error(
              "transaction failed",
            ),
          );

        await expect(
          dependencies
            .service
            .requestReset({
              email:
                "user@example.com",
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