import { z } from 'zod';
import { emailSchema, uuidSchema } from '../common';
import { projectRoleSchema } from '../enums';

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: projectRoleSchema,
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: projectRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const memberSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  userId: uuidSchema,
  email: z.string().email(),
  name: z.string(),
  role: projectRoleSchema,
  createdAt: z.string(),
});
export type Member = z.infer<typeof memberSchema>;
