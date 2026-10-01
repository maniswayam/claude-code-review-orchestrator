import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, colorize } = format;

const consoleFormat = printf(({ level, message, timestamp: ts }) => `${ts} ${level}: ${String(message)}`);

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(colorize(), timestamp(), consoleFormat),
  transports: [new transports.Console()],
});

export default logger;
