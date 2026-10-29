import { z } from "zod";

import { DateTimeSchema, UuidSchema } from "./common";

export const TeamSchema = z.object({
  id: UuidSchema,
  workspace_id: UuidSchema,
  name: z.string(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export const CreateTeamRequestSchema = z.object({
  workspace_id: UuidSchema,
  name: z.string().min(1),
});

export const TeamMemberSchema = z.object({
  team_id: UuidSchema,
  user_id: UuidSchema,
  role: z.string(),
  created_at: DateTimeSchema,
});

export const CreateTeamMemberRequestSchema = z.object({
  user_id: UuidSchema,
  role: z.string().min(1).default("member"),
});

export type Team = z.infer<typeof TeamSchema>;
export type CreateTeamRequest = z.infer<typeof CreateTeamRequestSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type CreateTeamMemberRequest = z.infer<typeof CreateTeamMemberRequestSchema>;
