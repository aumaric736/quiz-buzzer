type Operation<T> = () => T | Promise<T>;

/** Preserve request arrival order within one activity, including answer/end races. */
export class ActivityOperationQueue {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(activityId: string, operation: Operation<T>): Promise<T> {
    const previous = this.tails.get(activityId) ?? Promise.resolve();
    const current = previous.then(operation);
    const tail = current.then(() => undefined, () => undefined);
    this.tails.set(activityId, tail);
    void tail.then(() => { if (this.tails.get(activityId) === tail) this.tails.delete(activityId); });
    return current;
  }
}

export const activityOperationQueue = new ActivityOperationQueue();
