import pino from 'pino';

const env = process.env.NODE_ENV ?? 'development';

/**
 * JSON logs (pretty in development, silent in tests). Cookies, auth headers and
 * passwords are redacted so secrets never reach the log (plan M13 security pass).
 */
export const logger = pino({
  level: env === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
    '*.password',
    '*.currentPassword',
    '*.newPassword',
    '*.token',
  ],
  ...(env === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
});
