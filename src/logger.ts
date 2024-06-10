import pino from "pino";

import { LOG_LEVEL } from "./config.js";

const logger = pino({
  level: LOG_LEVEL, // Set the default logging level
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
