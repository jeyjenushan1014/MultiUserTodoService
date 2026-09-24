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
  PasswordVerifier,
} from "../../../../security/password-hasher.js";

import type {
  LoginRepository,
} from "../login.repository.interface.js";

import {
  LoginService,
} from "../login.service.js";

import type {
  LoginUserRow,
} from "../login.types.js";

vi.mock(
  "../../../../security/access-token.service.js",
  () => ({
    createAccessToken:
      vi.fn(),
  }),
);

interface TestDependencies {
  readonly repository:
    LoginRepository;

  readonly passwordVerifier:
    PasswordVerifier;

  readonly findUserByEmailMock:
    ReturnType<
      typeof vi.fn<
        LoginRepository[
          "findUserByEmail"
        ]
      >
    >;

  readonly createSessionMock:
    ReturnType<
      typeof vi.fn<
        LoginRepository[
          "createSession"
        ]
      >
    >;

  readonly verifyPasswordMock:
    ReturnType<
      typeof vi.fn<
        PasswordVerifier["verify"]
      >
    >;
}

function createDependencies():
  TestDependencies {
  const findUserByEmailMock =
    vi.fn<
      LoginRepository[
        "findUserByEmail"
      ]
    >();

  const createSessionMock =
    vi.fn<
      LoginRepository[
        "createSession"
      ]
    >();

  const verifyPasswordMock =
    vi.fn<
      PasswordVerifier["verify"]
    >();

  return {
    findUserByEmailMock,
    createSessionMock,
    verifyPasswordMock,

    repository: {
      findUserByEmail:
        findUserByEmailMock,

      createSession:
        createSessionMock,
    },

    passwordVerifier: {
      verify:
        verifyPasswordMock,
    },
  };
}

const user: LoginUserRow = {
  id:
    "a95fd118-f777-4500-9ea9-7d1a650fdadb",

  email:
    "user@example.com",

  password_hash:
    "$2b$12$stored-password-hash",
};

const request = {
  email:
    "User@Example.COM",

  password:
    "StrongPassword123!",
};

describe(
  "LoginService",
  () => {
    beforeEach(() => {
      vi.mocked(
        createAccessToken,
      ).mockReset();
    });

    it(
      "returns access and refresh tokens for valid credentials",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockResolvedValue(user);

        dependencies
          .verifyPasswordMock
          .mockResolvedValue(true);

        dependencies
          .createSessionMock
          .mockResolvedValue();

        vi.mocked(
          createAccessToken,
        ).mockResolvedValue(
          "signed-access-token",
        );

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        const result =
          await service.login(request);

        expect(result.data.user)
          .toEqual({
            id: user.id,
            email: user.email,
          });

        expect(
          result.data.accessToken,
        ).toBe(
          "signed-access-token",
        );

        expect(
          result.data.refreshToken,
        ).toEqual(
          expect.any(String),
        );

        expect(
          result.data.refreshToken,
        ).not.toHaveLength(0);
      },
    );

    it(
      "normalizes the email before querying the repository",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockResolvedValue(user);

        dependencies
          .verifyPasswordMock
          .mockResolvedValue(true);

        dependencies
          .createSessionMock
          .mockResolvedValue();

        vi.mocked(
          createAccessToken,
        ).mockResolvedValue(
          "signed-access-token",
        );

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await service.login({
          email:
            "  User@Example.COM  ",
          password:
            "StrongPassword123!",
        });

        expect(
          dependencies
            .findUserByEmailMock,
        ).toHaveBeenCalledWith(
          "user@example.com",
        );
      },
    );

    it(
      "verifies the password against the stored hash",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockResolvedValue(user);

        dependencies
          .verifyPasswordMock
          .mockResolvedValue(true);

        dependencies
          .createSessionMock
          .mockResolvedValue();

        vi.mocked(
          createAccessToken,
        ).mockResolvedValue(
          "signed-access-token",
        );

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await service.login(request);

        expect(
          dependencies
            .verifyPasswordMock,
        ).toHaveBeenCalledWith(
          request.password,
          user.password_hash,
        );
      },
    );

    it(
      "stores only the hash of the refresh token",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockResolvedValue(user);

        dependencies
          .verifyPasswordMock
          .mockResolvedValue(true);

        dependencies
          .createSessionMock
          .mockResolvedValue();

        vi.mocked(
          createAccessToken,
        ).mockResolvedValue(
          "signed-access-token",
        );

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        const result =
          await service.login(request);

        const firstCall =
          dependencies
            .createSessionMock
            .mock
            .calls[0];

        expect(firstCall)
          .toBeDefined();

        const sessionData =
          firstCall?.[0];

        expect(sessionData)
          .toBeDefined();

        expect(
          sessionData
            ?.refreshTokenHash,
        ).toBe(
          hashOpaqueToken(
            result.data.refreshToken,
          ),
        );

        expect(
          sessionData
            ?.refreshTokenHash,
        ).not.toBe(
          result.data.refreshToken,
        );
      },
    );

    it(
    "creates an access token with the user and session identity",
      async () => {
    const dependencies =
      createDependencies();

    dependencies
      .findUserByEmailMock
      .mockResolvedValue(user);

    dependencies
      .verifyPasswordMock
      .mockResolvedValue(true);

    dependencies
      .createSessionMock
      .mockResolvedValue();

    vi.mocked(
      createAccessToken,
    ).mockResolvedValue(
      "signed-access-token",
    );

    const service =
      new LoginService(
        dependencies.repository,
        dependencies.passwordVerifier,
      );

    await service.login(request);

    expect(
      createAccessToken,
    ).toHaveBeenCalledOnce();

    const firstCall =
      vi
        .mocked(createAccessToken)
        .mock
        .calls[0];

    if (firstCall === undefined) {
      throw new Error(
        "Expected createAccessToken to be called",
      );
    }

    const tokenInput =
      firstCall[0];

    expect(tokenInput.userId)
      .toBe(user.id);

    expect(tokenInput.email)
      .toBe(user.email);

    expect(
      typeof tokenInput.sessionId,
    ).toBe("string");

    expect(tokenInput.sessionId)
      .not.toHaveLength(0);
  },
);

    it(
      "returns generic invalid credentials when the user does not exist",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockResolvedValue(
            undefined,
          );

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        const operation =
          service.login(request);

        await expect(operation)
          .rejects
          .toMatchObject({
            statusCode: 401,
            code:
              "INVALID_CREDENTIALS",
            message:
              "Email or password is incorrect",
          });

        expect(
          dependencies
            .verifyPasswordMock,
        ).not.toHaveBeenCalled();

        expect(
          dependencies
            .createSessionMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns the same generic error when the password is incorrect",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockResolvedValue(user);

        dependencies
          .verifyPasswordMock
          .mockResolvedValue(false);

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        const operation =
          service.login(request);

        await expect(operation)
          .rejects
          .toMatchObject({
            statusCode: 401,
            code:
              "INVALID_CREDENTIALS",
            message:
              "Email or password is incorrect",
          });

        expect(
          dependencies
            .createSessionMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not create a token when session persistence fails",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockResolvedValue(user);

        dependencies
          .verifyPasswordMock
          .mockResolvedValue(true);

        dependencies
          .createSessionMock
          .mockRejectedValue(
            new Error(
              "Database unavailable",
            ),
          );

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await expect(
          service.login(request),
        ).rejects.toThrow(
          "Database unavailable",
        );

       expect(
          createAccessToken,
       ).toHaveBeenCalledOnce();
      },
    );

    it(
      "propagates password verification failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockResolvedValue(user);

        dependencies
          .verifyPasswordMock
          .mockRejectedValue(
            new Error(
              "Password verification failed",
            ),
          );

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await expect(
          service.login(request),
        ).rejects.toThrow(
          "Password verification failed",
        );

        expect(
          dependencies
            .createSessionMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "propagates repository lookup failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findUserByEmailMock
          .mockRejectedValue(
            new Error(
              "Database unavailable",
            ),
          );

        const service =
          new LoginService(
            dependencies.repository,
            dependencies.passwordVerifier,
          );

        await expect(
          service.login(request),
        ).rejects.toThrow(
          "Database unavailable",
        );

        expect(
          dependencies
            .verifyPasswordMock,
        ).not.toHaveBeenCalled();

        expect(
          dependencies
            .createSessionMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);