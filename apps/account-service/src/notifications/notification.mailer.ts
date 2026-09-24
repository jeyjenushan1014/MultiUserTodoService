import {
  createTransport,
} from "nodemailer";

import {
  env,
} from "../config/env.js";

export interface NotificationMailer {
  sendTodoSharedEmail(
    recipientEmail: string,
    todoId: string,
  ): Promise<void>;

  sendTodoShareWithdrawnEmail(
    recipientEmail: string,
    todoId: string,
  ): Promise<void>;
}

export class SmtpNotificationMailer
implements NotificationMailer {
  private readonly transporter =
    createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: false,
    });

  public async sendTodoSharedEmail(
    recipientEmail: string,
    todoId: string,
  ): Promise<void> {
    await this.transporter.sendMail({
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
    await this.transporter.sendMail({
      from: env.MAIL_FROM,
      to: recipientEmail,
      subject: "TODO sharing was withdrawn",
      text:
        `TODO sharing was withdrawn.\n\n` +
        `TODO ID: ${todoId}`,
    });
  }
}