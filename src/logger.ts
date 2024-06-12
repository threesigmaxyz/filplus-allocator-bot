import pino from "pino";

import config from "./config.js";

const logger = pino({
  level: config.logging.level,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
