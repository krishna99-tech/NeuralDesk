import { z } from 'zod';

export const McpTransportSchema = z.enum(['stdio', 'sse', 'http']);

export const McpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: McpTransportSchema,
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  env: z.record(z.string(), z.string()).default({}),
  timeoutMs: z.number().int().positive().default(45000),
  enabled: z.boolean().default(true),
  chatCommand: z.string().optional(),
  chatArgs: z.array(z.string()).default([]),
  chatEnv: z.record(z.string(), z.string()).default({}),
  credentialRef: z.string().default(''),
});

export type McpServerConfig = z.infer<typeof McpServerSchema>;

export const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerSchema).default({}),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;
