import { z } from 'zod';
import { emailSchema, uuidSchema } from '../common';

export const passwordSchema = z
  .string()
  .min(10, 'must be at least 10 characters')
  .max(200)
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/[0-9]/, 'must contain a digit');

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(120),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: userSchema,
});
export type AuthTokens = z.infer<typeof authTokensSchema>;
