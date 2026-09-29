import {
  PostgresWorkspaceRepository,
} from "./workspace.repository.js";

import {
  WorkspaceService,
} from "./workspace.service.js";

const repository =
  new PostgresWorkspaceRepository();

export const workspaceService =
  new WorkspaceService(repository);
