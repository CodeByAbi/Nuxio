import { z } from "zod";

/**
 * Complexity rule (letter + digit, 8+ chars) applies at register only —
 * loginSchema deliberately has no password complexity check (an existing
 * account may predate a policy change; login must still accept it).
 */
export const registerSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .regex(/[A-Za-z]/, "Password must contain at least one letter.")
    .regex(/[0-9]/, "Password must contain at least one number."),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
