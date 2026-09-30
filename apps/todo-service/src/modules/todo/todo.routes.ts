import {
  Router,
} from "express";

import {
  updateTodoController,
} from "./update/update.todo.controller.js";

import {
  shareTodoController,
} from "./share/share.todo.controller.js";

import {
  createTodoShareBodySchema,
} from "./share/share.todo.validation.js";

import {
  updateTodoBodySchema,
} from "./update/update.todo.validation.js";

import {
  validateQuery,
} from "../../middleware/validate-query.middleware.js";

import {
  requireInternalIdentity,
} from "../../middleware/internal-service-auth.middleware.js";

import {
  validateBody,
} from "../../middleware/validate-body.middleware.js";

import {
  CreateTodoController,
} from "./create/create.todo.controller.js";

import {
  deleteTodoController,
} from "./delete/delete.todo.controller.js";

import {
  PostgresTodoRepository,
} from "./create/create.todo.repository.js";

import {
  CreateTodoService,
} from "./create/create.todo.service.js"

import {
  validateParams,
} from "../../middleware/validate-params.middleware.js";

import {
  getTodoController,
} from "./get/get.todo.controller.js";

import {
  listTodoHistoryController,
} from "./history/list.todo.history.controller.js";

import {
  withdrawTodoShareController,
} from "./share/withdraw/withdraw.todo.share.controller.js";

import {
  withdrawTodoShareParamsSchema,
} from "./share/withdraw/withdraw.todo.share.validation.js";

import {
  getTodoParamsSchema,
} from "./get/get.todo.validation.js";

import {
  listTodosQuerySchema,
} from "./list/list-todos.validation.js";

import {
  listTodosController,
} from "./list/list-todo.controller.js";

import {
  createTodoSchema,
} from "./todo.validation.js";


import {
  RedisTodoCacheInvalidator,
} from "./cache/redis.todo.cache.invalidator.js";

import { database } from "../../config/database.js";
import { authorizeWorkspaceIfPresent } from "../../middleware/authorize-workspace.middleware.js";

export const todoRouter =
  Router();

const todoRepository =
  new PostgresTodoRepository();

const cacheInvalidator =
  new RedisTodoCacheInvalidator();

const createTodoService =
  new CreateTodoService(
    todoRepository,
    cacheInvalidator,
  );

const createTodoController =
  new CreateTodoController(
    createTodoService,
  );

todoRouter.use(
  requireInternalIdentity,
);

todoRouter.post(
  "/",
  validateBody(
    createTodoSchema,
  ),
  createTodoController.create,
);

todoRouter.get(
  "/",
  validateQuery(
    listTodosQuerySchema,
  ),
  listTodosController,
);

todoRouter.post(
  "/:todoId/shares",
  // Attach workspaceId when available (fail-open for NULL workspace_id)
  async (req, _res, next) => {
    try {
      const todoId = (req.params as Record<string, string>).todoId;

      if (typeof todoId === "string" && todoId.length > 0) {
        const result = await database.query<{ workspace_id: string | null }>(
          `SELECT workspace_id FROM todos WHERE id = $1 AND deleted_at IS NULL`,
          [todoId],
        );

        const row = result.rows[0];

        if (row && row.workspace_id !== null) {
          (req.params as Record<string, string>).workspaceId = row.workspace_id;
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  validateParams(
    getTodoParamsSchema,
  ),
  // Require workspace read permission if the TODO belongs to a workspace
  authorizeWorkspaceIfPresent("task.update"),
  validateBody(
    createTodoShareBodySchema,
  ),
  shareTodoController,
);

todoRouter.delete(
  "/:todoId/shares/:recipientId",
  async (req, _res, next) => {
    try {
      const todoId = (req.params as Record<string, string>).todoId;

      if (typeof todoId === "string" && todoId.length > 0) {
        const result = await database.query<{ workspace_id: string | null }>(
          `SELECT workspace_id FROM todos WHERE id = $1 AND deleted_at IS NULL`,
          [todoId],
        );

        const row = result.rows[0];

        if (row && row.workspace_id !== null) {
          (req.params as Record<string, string>).workspaceId = row.workspace_id;
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  validateParams(
    withdrawTodoShareParamsSchema,
  ),
  // If the TODO belongs to a workspace, require update permission
  authorizeWorkspaceIfPresent("task.update"),
  withdrawTodoShareController,
);

todoRouter.get(
  "/:todoId",
  validateParams(
    getTodoParamsSchema,
  ),
  // Attach workspaceId for read checks when present; GetTodoService also applies access rules
  async (req, _res, next) => {
    try {
      const todoId = (req.params as Record<string, string>).todoId;

      if (typeof todoId === "string" && todoId.length > 0) {
        const result = await database.query<{ workspace_id: string | null }>(
          `SELECT workspace_id FROM todos WHERE id = $1 AND deleted_at IS NULL`,
          [todoId],
        );

        const row = result.rows[0];

        if (row && row.workspace_id !== null) {
          (req.params as Record<string, string>).workspaceId = row.workspace_id;
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  authorizeWorkspaceIfPresent("task.read"),
  getTodoController,
);

todoRouter.get(
  "/:todoId/history",
  validateParams(
    getTodoParamsSchema,
  ),
  async (req, _res, next) => {
    try {
      const todoId = (req.params as Record<string, string>).todoId;

      if (typeof todoId === "string" && todoId.length > 0) {
        const result = await database.query<{ workspace_id: string | null }>(
          `SELECT workspace_id FROM todos WHERE id = $1 AND deleted_at IS NULL`,
          [todoId],
        );

        const row = result.rows[0];

        if (row && row.workspace_id !== null) {
          (req.params as Record<string, string>).workspaceId = row.workspace_id;
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  authorizeWorkspaceIfPresent("task.read"),
  listTodoHistoryController,
);

todoRouter.patch(
  "/:todoId",
  validateParams(
    getTodoParamsSchema,
  ),
  validateBody(
    updateTodoBodySchema,
  ),
  async (req, _res, next) => {
    try {
      const todoId = (req.params as Record<string, string>).todoId;

      if (typeof todoId === "string" && todoId.length > 0) {
        const result = await database.query<{ workspace_id: string | null }>(
          `SELECT workspace_id FROM todos WHERE id = $1 AND deleted_at IS NULL`,
          [todoId],
        );

        const row = result.rows[0];

        if (row && row.workspace_id !== null) {
          (req.params as Record<string, string>).workspaceId = row.workspace_id;
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  authorizeWorkspaceIfPresent("task.update"),
  updateTodoController,
);

todoRouter.delete(
  "/:todoId",
  validateParams(
    getTodoParamsSchema,
  ),
  async (req, _res, next) => {
    try {
      const todoId = (req.params as Record<string, string>).todoId;

      if (typeof todoId === "string" && todoId.length > 0) {
        const result = await database.query<{ workspace_id: string | null }>(
          `SELECT workspace_id FROM todos WHERE id = $1 AND deleted_at IS NULL`,
          [todoId],
        );

        const row = result.rows[0];

        if (row && row.workspace_id !== null) {
          (req.params as Record<string, string>).workspaceId = row.workspace_id;
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  authorizeWorkspaceIfPresent("task.delete"),
  deleteTodoController,
);