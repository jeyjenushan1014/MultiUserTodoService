import { PostgresAccountDeletionRepository } from "./account-deletion.repository.js";
import { AccountDeletionService } from "./account-deletion.service.js";

const repository = new PostgresAccountDeletionRepository();

export const accountDeletionService = new AccountDeletionService(repository);