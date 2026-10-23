import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  DEFAULT_UPSTREAM_URL: z.string().url().default('http://127.0.0.1:8081'),
  FAIL_OPEN: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('true'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnvConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errorDetails = JSON.stringify(parsed.error.format(), null, 2);
    throw new Error(`Invalid environment configuration: ${errorDetails}`);
  }
  return parsed.data;
}

export const config: EnvConfig = loadEnvConfig();
