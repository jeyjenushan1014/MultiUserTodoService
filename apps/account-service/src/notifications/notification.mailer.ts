import {
  createTransport,
} from "nodemailer";

import {
  env,
} from "../config/env.js";

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Mail provider timed out"));
    }, timeoutMilliseconds);

    timer.unref();

    void operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("Mail provider failed"));
      },
    );
  });
}

export interface NotificationMailer {
  sendTodoSharedEmail(
    recipientEmail: string,
    todoId: string,
  ): Promise<void>;

  sendTodoShareWithdrawnEmail(
    recipientEmail: string,
    todoId: string,
  ): Promise<void>;

  sendPasswordResetEmail(
    recipientEmail: string,
    resetToken: string,
    expiresAt: string,
  ): Promise<void>;
}

export class SmtpNotificationMailer
implements NotificationMailer {
  private readonly transporter =
    createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: false,
      connectionTimeout: env.MAIL_CONNECTION_TIMEOUT_MS,
      greetingTimeout: env.MAIL_GREETING_TIMEOUT_MS,
      socketTimeout: env.MAIL_SOCKET_TIMEOUT_MS,
    });

  private async sendMail(
    message: Parameters<typeof this.transporter.sendMail>[0],
  ): Promise<void> {
    await withTimeout(
      this.transporter.sendMail(message),
      env.MAIL_SOCKET_TIMEOUT_MS,
    );
  }

  public async sendTodoSharedEmail(
    recipientEmail: string,
    todoId: string,
  ): Promise<void> {
    await this.sendMail({
      from: env.MAIL_FROM,
      to: recipientEmail,
      subject: "A TODO was shared with you",
      text:
        `A TODO was shared with you.\n\n` +
        `TODO ID: ${todoId}\n` +
        `Permission: state-update`,
    });
  }

  public async sendTodoShareWithdrawnEmail(
    recipientEmail: string,
    todoId: string,
  ): Promise<void> {
    await this.sendMail({
      from: env.MAIL_FROM,
      to: recipientEmail,
      subject: "TODO sharing was withdrawn",
      text:
        `TODO sharing was withdrawn.\n\n` +
        `TODO ID: ${todoId}`,
    });
  }

  public async sendPasswordResetEmail(
    recipientEmail: string,
    resetToken: string,
    expiresAt: string,
  ): Promise<void> {
    await this.sendMail({
      from: env.MAIL_FROM,
      to: recipientEmail,
      subject: "Reset your password",
      text:
        `Reset your password.\n\n` +
        `Reset token: ${resetToken}\n` +
        `Expires at: ${expiresAt}`,
    });
  }
}