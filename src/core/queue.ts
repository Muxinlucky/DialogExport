import { EXPORT_DELAY_MS } from './constants';
import { sleep } from './sleep';

export class SequentialQueue<T> {
  private stopped = false;

  stop(): void {
    this.stopped = true;
  }

  reset(): void {
    this.stopped = false;
  }

  isStopped(): boolean {
    return this.stopped;
  }

  async run(items: T[], handler: (item: T, index: number) => Promise<void>): Promise<void> {
    this.reset();

    for (let index = 0; index < items.length; index += 1) {
      if (this.stopped) {
        return;
      }

      await handler(items[index], index);

      if (!this.stopped && index < items.length - 1) {
        await sleep(EXPORT_DELAY_MS);
      }
    }
  }
}
