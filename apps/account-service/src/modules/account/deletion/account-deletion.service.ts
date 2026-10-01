import type { AccountDeletionRepository } from "./account-deletion.repository.interface.js";

export class AccountDeletionService {
  public constructor(private readonly repository: AccountDeletionRepository) {}

  public async requestDeletion(input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly correlationId: string;
  }): Promise<{ readonly id: string }> {
    const request = await this.repository.requestDeletion(input);
    return { id: request.id };
  }
}