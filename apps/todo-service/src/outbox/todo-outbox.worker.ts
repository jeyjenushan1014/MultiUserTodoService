import type {
  TodoOutboxBatchResult,
} from "./todo-outbox.service.js";

export interface TodoOutboxBatchProcessor {
  processBatch():
    Promise<
      TodoOutboxBatchResult
    >;
}

export interface TodoOutboxWorkerObserver {
  batchProcessed(
    result:
      TodoOutboxBatchResult,
  ): void;

  processingFailed(
    error:
      unknown,
  ): void;
}

export class TodoOutboxWorker {
  private stopRequested =
    false;

  private wakeWaiter:
    (() => void) | undefined;

  public constructor(
    private readonly processor:
      TodoOutboxBatchProcessor,

    private readonly pollIntervalMilliseconds:
      number,

    private readonly observer:
      TodoOutboxWorkerObserver,
  ) {}

  public async run():
    Promise<void> {
    while (
      this.shouldContinue()
    ) {
      try {
        const result =
          await this.processor
            .processBatch();

        this.observer
          .batchProcessed(
            result,
          );

        if (
          result.claimed === 0 &&
          this.shouldContinue()
        ) {
          await this
            .waitForNextPoll();
        }
      } catch (error) {
        this.observer
          .processingFailed(
            error,
          );

        if (
          this.shouldContinue()
        ) {
          await this
            .waitForNextPoll();
        }
      }
    }
  }

  public stop(): void {
    this.stopRequested =
      true;

    /*
     * Wake a worker currently waiting for its
     * next polling interval.
     */
    this.wakeWaiter?.();
  }

  private shouldContinue():
    boolean {
    return !this.stopRequested;
  }

  private waitForNextPoll():
    Promise<void> {
    return new Promise(
      (resolve) => {
        const timer =
          setTimeout(
            () => {
              this.wakeWaiter =
                undefined;

              resolve();
            },
            this
              .pollIntervalMilliseconds,
          );

        this.wakeWaiter =
          () => {
            clearTimeout(
              timer,
            );

            this.wakeWaiter =
              undefined;

            resolve();
          };
      },
    );
  }
}