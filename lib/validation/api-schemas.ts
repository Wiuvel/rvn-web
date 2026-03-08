/**
 * API route validation schemas (Zod)
 */
import { z } from 'zod';
import { TICKET_SUBJECT_MAX_LENGTH, MESSAGE_MAX_LENGTH } from '@/lib/utils/constants';

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID format');

/** Captcha body: protection/verify, rate-limit/clear */
export const captchaBodySchema = z.object({
  captchaToken: z.string().min(1, 'Captcha token is required'),
});

/** Create ticket body: POST support/tickets */
export const createTicketBodySchema = z.object({
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(TICKET_SUBJECT_MAX_LENGTH, 'Subject too long')
    .transform((s) => s.trim()),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(MESSAGE_MAX_LENGTH, 'Message too long')
    .transform((s) => s.trim()),
});

/** GET support/tickets query: status, statuses, forUser */
export const supportTicketsQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'pending', 'all']).optional(),
  statuses: z.string().optional(), // "open,pending" or "closed"
  forUser: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Attachment item for createMessageBodySchema. Documents have blur_hash/width/height as null. */
const attachmentItemSchema = z.object({
  storagePath: z.string(),
  storageUrl: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  blur_hash: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

/** Create message body: POST support/tickets/[ticketId]/messages */
export const createMessageBodySchema = z
  .object({
    message: z.string().optional(),
    csrfToken: z.string().optional(),
    attachments: z.array(attachmentItemSchema).optional().default([]),
  })
  .refine(
    (data) => {
      if (!data.attachments || data.attachments.length === 0) {
        return (
          data.message != null && typeof data.message === 'string' && data.message.trim().length > 0
        );
      }
      return true;
    },
    { message: 'Message is required when no attachments', path: ['message'] },
  )
  .refine(
    (data) => {
      if (data.message && typeof data.message === 'string') {
        return data.message.length <= MESSAGE_MAX_LENGTH;
      }
      return true;
    },
    { message: 'Message too long', path: ['message'] },
  );

/** Update ticket body: PATCH support/tickets/[ticketId] */
export const updateTicketBodySchema = z.object({
  status: z
    .enum(['open', 'closed', 'pending', 'resolved'])
    .optional()
    .transform((v) => (v === 'resolved' ? 'closed' : v)),
  assignedTo: z.union([uuidSchema, z.null()]).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  closeReason: z.string().optional(),
});

/** GET support/tickets/[ticketId] query: limit, offset (messages pagination) */
export const ticketMessagesQuerySchema = z
  .object({
    limit: z.string().optional().default('100'),
    offset: z.string().optional().default('0'),
  })
  .transform((data) => ({
    limit: Math.min(Math.max(parseInt(data.limit, 10) || 100, 1), 500),
    offset: Math.max(parseInt(data.offset, 10) || 0, 0),
  }));

/** Grant role body: POST admin/users/roles */
export const grantRoleBodySchema = z.object({
  userId: uuidSchema,
  role: z.enum(['support', 'admin']),
});

/** GET admin/users/roles query: userId, role */
export const usersRolesQuerySchema = z.object({
  userId: uuidSchema.optional(),
  role: z.enum(['support', 'admin']).optional(),
});

/** GET admin/users query: q, limit, order */
export const adminUsersQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((s) => s?.trim() ?? ''),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v ?? '50', 10);
      return Number.isNaN(n) ? 50 : Math.min(Math.max(n, 1), 100);
    }),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .transform((v) => (v === 'asc' ? 'asc' : 'desc')),
});

/** Maintenance body: POST admin/maintenance */
export const maintenanceBodySchema = z.object({
  isActive: z.boolean().optional(),
  scheduledStart: z.string().nullable().optional(),
  scheduledEnd: z.string().nullable().optional(),
  message: z.string().optional(),
});

/** DELETE admin/trusted-developers query: id */
export const trustedDeveloperIdQuerySchema = z.object({
  id: uuidSchema,
});

/** Create comment body: POST user/[user_id]/comments */
export const createCommentBodySchema = z.object({
  content: z
    .string()
    .min(1, 'Content is required')
    .max(1000, 'Comment too long (max 1000 chars)')
    .transform((s) => s.trim()),
  parent_id: uuidSchema.optional().or(z.null()),
});

/** POST support/upload query: ticketId */
export const supportUploadQuerySchema = z.object({
  ticketId: uuidSchema,
});

/** Route param: ticketId */
export const ticketIdParamSchema = z.object({
  ticketId: uuidSchema,
});

/** Route param: user_id */
export const userIdParamSchema = z.object({
  user_id: z.string().min(1, 'User ID is required'),
});

/** Route param: deviceId */
export const deviceIdParamSchema = z.object({
  deviceId: uuidSchema,
});
