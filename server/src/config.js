// Runtime configuration from environment variables (see .env.example).

const env = process.env;

export const config = Object.freeze({
  nodeEnv: env.NODE_ENV ?? 'development',
  isProduction: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 4000),
  appOrigin: env.APP_ORIGIN ?? 'http://localhost:5173',
  dbPath: env.DB_PATH ?? './data/app.db',
  sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
  cookieSecure: env.COOKIE_SECURE === 'true',
});
