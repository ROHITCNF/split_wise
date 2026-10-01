import crypto from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../logger.js';

/** Logs each request with a request ID (also returned as X-Request-Id) and the user ID. */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customProps: (req) => ({ userId: req.user?.id }),
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
