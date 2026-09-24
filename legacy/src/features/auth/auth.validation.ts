import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(12)
  .max(128);

export const credentialsSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
  }),

  params: z.object({}),
  query: z.object({}),
});