import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json() // logs in JSON (good for cloud services)
  ),
  transports: [
    new transports.Console(), // log to console
    new transports.File({ filename: 'logs/error.log', level: 'error' }), // errors only
    new transports.File({ filename: 'logs/combined.log' }) // everything
  ],
});

export default logger;
