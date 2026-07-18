const PREFIX = '[Dialog-Export]';
const DEBUG = false;

export const logger = {
  debug(message: string, ...args: unknown[]) {
    if (DEBUG) {
      console.debug(PREFIX, message, ...args);
    }
  },
  info(message: string, ...args: unknown[]) {
    console.info(PREFIX, message, ...args);
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(PREFIX, message, ...args);
  },
  error(message: string, ...args: unknown[]) {
    console.error(PREFIX, message, ...args);
  }
};
