import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const sendMailMock =
  vi.fn();

vi.mock(
  "nodemailer",
  () => ({
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
    })),
  }),
);

vi.mock(
  "../../config/env.js",
  () => ({
    env: {
      MAIL_HOST: "mailpit",
      MAIL_PORT: 1025,
      MAIL_FROM: "no-reply@todo.local",
    },
  }),
);

import {
  SmtpNotificationMailer,
} from "../notification.mailer.js";

describe(
  "SmtpNotificationMailer",
  () => {
    beforeEach(() => {
      sendMailMock.mockReset();
      sendMailMock.mockResolvedValue({
        messageId: "message-id",
      });
    });

    it(
      "sends a TODO shared email",
      async () => {
        const mailer =
          new SmtpNotificationMailer();

        await mailer.sendTodoSharedEmail(
          "recipient@example.com",
          "todo-id",
        );

        expect(
          sendMailMock,
        ).toHaveBeenCalledWith({
          from:
            "no-reply@todo.local",

          to:
            "recipient@example.com",

          subject:
            "A TODO was shared with you",

          text:
            "A TODO was shared with you.\n\n" +
            "TODO ID: todo-id\n" +
            "Permission: state-update",
        });
      },
    );

    it(
      "sends a share withdrawn email",
      async () => {
        const mailer =
          new SmtpNotificationMailer();

        await mailer
          .sendTodoShareWithdrawnEmail(
            "recipient@example.com",
            "todo-id",
          );

        expect(
          sendMailMock,
        ).toHaveBeenCalledWith({
          from:
            "no-reply@todo.local",

          to:
            "recipient@example.com",

          subject:
            "TODO sharing was withdrawn",

          text:
            "TODO sharing was withdrawn.\n\n" +
            "TODO ID: todo-id",
        });
      },
    );

    it(
      "propagates SMTP errors",
      async () => {
        const error =
          new Error("SMTP unavailable");

        sendMailMock.mockRejectedValue(
          error,
        );

        const mailer =
          new SmtpNotificationMailer();

        await expect(
          mailer.sendTodoSharedEmail(
            "recipient@example.com",
            "todo-id",
          ),
        ).rejects.toBe(error);
      },
    );
  },
);