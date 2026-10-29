import { z } from "zod";

export const UuidSchema = z.string().uuid();
export const DateTimeSchema = z.string().datetime();

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const paginatedResponseSchema = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.object({
    items: z.array(schema),
    next_cursor: z.string().nullable(),
  });

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    request_id: z.string(),
  }),
});

export const apiSuccessSchema = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.object({
    data: schema,
  });

export type ApiSuccess<T> = {
  data: T;
};

export type PaginatedResponse<T> = {
  items: T[];
  next_cursor: string | null;
};

export type ApiError = z.infer<typeof ApiErrorSchema>;
