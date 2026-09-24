import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  MockedFunction,
} from "vitest";

import type {
  TodoOutboxBatchProcessor,
  TodoOutboxWorkerObserver,
} from "../todo-outbox.worker.js";

import {
  TodoOutboxWorker,
} from "../todo-outbox.worker.js";

interface Dependencies {
  readonly processBatchMock:
    MockedFunction<
      TodoOutboxBatchProcessor[
        "processBatch"
      ]
    >;

  readonly batchProcessedMock:
    MockedFunction<
      TodoOutboxWorkerObserver[
        "batchProcessed"
      ]
    >;

  readonly processingFailedMock:
    MockedFunction<
      TodoOutboxWorkerObserver[
        "processingFailed"
      ]
    >;

  readonly processor:
    TodoOutboxBatchProcessor;

  readonly observer:
    TodoOutboxWorkerObserver;
}

function createDependencies():
  Dependencies {
  const processBatchMock =
    vi.fn<
      TodoOutboxBatchProcessor[
        "processBatch"
      ]
    >();

  const batchProcessedMock =
    vi.fn<
      TodoOutboxWorkerObserver[
        "batchProcessed"
      ]
    >();

  const processingFailedMock =
    vi.fn<
      TodoOutboxWorkerObserver[
        "processingFailed"
      ]
    >();

  return {
    processBatchMock,
    batchProcessedMock,
    processingFailedMock,

    processor: {
      processBatch:
        processBatchMock,
    },

    observer: {
      batchProcessed:
        batchProcessedMock,

      processingFailed:
        processingFailedMock,
    },
  };
}

describe(
  "TodoOutboxWorker",
  () => {
    it(
      "processes batches until shutdown is requested",
      async () => {
        const dependencies =
          createDependencies();

        const workerReference: {
          current?:
            TodoOutboxWorker;
        } = {};

        dependencies
          .processBatchMock
          .mockImplementationOnce(
              () => {
    workerReference
      .current
      ?.stop();

    return Promise.resolve({
      claimed:
        2,

      published:
        2,

      failed:
        0,
    });
  },
);

        const worker =
          new TodoOutboxWorker(
            dependencies.processor,
            1_000,
            dependencies.observer,
          );

        workerReference.current =
          worker;

        await worker.run();

        expect(
          dependencies
            .processBatchMock,
        ).toHaveBeenCalledOnce();

        expect(
          dependencies
            .batchProcessedMock,
        ).toHaveBeenCalledWith({
          claimed:
            2,

          published:
            2,

          failed:
            0,
        });

        expect(
          dependencies
            .processingFailedMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "reports a processing error and retries",
      async () => {
        const dependencies =
          createDependencies();

        const workerReference: {
          current?:
            TodoOutboxWorker;
        } = {};

        dependencies
          .processBatchMock
          .mockRejectedValueOnce(
            new Error(
              "PostgreSQL unavailable",
            ),
          )
          .mockImplementationOnce(
  () => {
    workerReference
      .current
      ?.stop();

    return Promise.resolve({
      claimed:
        1,

      published:
        1,

      failed:
        0,
    });
  },
);

        const worker =
          new TodoOutboxWorker(
            dependencies.processor,
            0,
            dependencies.observer,
          );

        workerReference.current =
          worker;

        await worker.run();

        expect(
          dependencies
            .processBatchMock,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          dependencies
            .processingFailedMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              "PostgreSQL unavailable",
          }),
        );

        expect(
          dependencies
            .batchProcessedMock,
        ).toHaveBeenCalledWith({
          claimed:
            1,

          published:
            1,

          failed:
            0,
        });
      },
    );

    it(
      "wakes an idle worker during shutdown",
      async () => {
        vi.useFakeTimers();

        try {
          const dependencies =
            createDependencies();

          dependencies
            .processBatchMock
            .mockResolvedValue({
              claimed:
                0,

              published:
                0,

              failed:
                0,
            });

          const worker =
            new TodoOutboxWorker(
              dependencies.processor,
              60_000,
              dependencies.observer,
            );

          const runningWorker =
            worker.run();

          await vi
            .waitFor(
              () => {
                expect(
                  dependencies
                    .processBatchMock,
                ).toHaveBeenCalledOnce();
              },
            );

          worker.stop();

          await runningWorker;

          expect(
            dependencies
              .processBatchMock,
          ).toHaveBeenCalledOnce();
        } finally {
          vi.useRealTimers();
        }
      },
    );
  },
);