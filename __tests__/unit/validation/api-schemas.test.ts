import { describe, it, expect } from 'vitest';
import {
  captchaBodySchema,
  createTicketBodySchema,
  supportTicketsQuerySchema,
  createMessageBodySchema,
  updateTicketBodySchema,
  ticketMessagesQuerySchema,
  grantRoleBodySchema,
  adminUsersQuerySchema,
  maintenanceBodySchema,
  createCommentBodySchema,
  ticketIdParamSchema,
  userIdParamSchema,
  deviceIdParamSchema,
  trustedDeveloperIdQuerySchema,
} from '@/lib/validation/api-schemas';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const INVALID_UUID = 'not-a-uuid';

describe('captchaBodySchema', () => {
  it('принимает валидный captcha token', () => {
    expect(captchaBodySchema.safeParse({ captchaToken: 'abc123' }).success).toBe(true);
  });
  it('отклоняет пустой captcha token', () => {
    expect(captchaBodySchema.safeParse({ captchaToken: '' }).success).toBe(false);
  });
  it('отклоняет отсутствие captcha token', () => {
    expect(captchaBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('createTicketBodySchema', () => {
  it('принимает валидные данные тикета', () => {
    const result = createTicketBodySchema.safeParse({
      subject: 'Проблема',
      message: 'Описание проблемы',
    });
    expect(result.success).toBe(true);
  });
  it('обрезает пробелы (trim)', () => {
    const result = createTicketBodySchema.safeParse({
      subject: '  Тема  ',
      message: '  Текст  ',
    });
    expect(result.success).toBe(true);
    expect(result.success ? result.data.subject : '').toBe('Тема');
    expect(result.success ? result.data.message : '').toBe('Текст');
  });
  it('отклоняет пустую тему или сообщение', () => {
    expect(createTicketBodySchema.safeParse({ subject: '', message: 'Text' }).success).toBe(false);
    expect(createTicketBodySchema.safeParse({ subject: 'Theme', message: '' }).success).toBe(false);
  });
});

describe('supportTicketsQuerySchema', () => {
  it('принимает валидный status и трансформирует forUser', () => {
    expect(supportTicketsQuerySchema.safeParse({ status: 'open' }).success).toBe(true);
    const r = supportTicketsQuerySchema.safeParse({ forUser: 'true' });
    expect(r.success).toBe(true);
    expect(r.success ? r.data.forUser : undefined).toBe(true);
  });
  it('отклоняет невалидный status', () => {
    expect(supportTicketsQuerySchema.safeParse({ status: 'invalid' }).success).toBe(false);
  });
});

describe('createMessageBodySchema', () => {
  it('принимает сообщение с текстом', () => {
    expect(createMessageBodySchema.safeParse({ message: 'Hello' }).success).toBe(true);
  });
  it('отклоняет пустое сообщение без вложений', () => {
    expect(createMessageBodySchema.safeParse({ message: '' }).success).toBe(false);
    expect(createMessageBodySchema.safeParse({}).success).toBe(false);
  });
  it('принимает сообщение с вложениями без текста', () => {
    const result = createMessageBodySchema.safeParse({
      attachments: [
        {
          storagePath: 'support/t1/m1/photo.png',
          storageUrl: '/support/files/support%2Ft1%2Fm1%2Fphoto.png',
          fileName: 'photo.png',
          fileType: 'image/png',
          fileSize: 2048,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
  it('принимает сообщение с текстом и вложениями', () => {
    const result = createMessageBodySchema.safeParse({
      message: 'Check this file',
      attachments: [
        {
          storagePath: 'support/t1/m1/doc.pdf',
          storageUrl: '/support/files/support%2Ft1%2Fm1%2Fdoc.pdf',
          fileName: 'doc.pdf',
          fileType: 'application/pdf',
          fileSize: 5000,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
  it('принимает вложения с blur_hash, width, height (image metadata)', () => {
    const result = createMessageBodySchema.safeParse({
      attachments: [
        {
          storagePath: 'support/t1/m1/img.jpg',
          storageUrl: '/support/files/support%2Ft1%2Fm1%2Fimg.jpg',
          fileName: 'img.jpg',
          fileType: 'image/jpeg',
          fileSize: 3000,
          blur_hash: 'LGF5]+Yk^6#M@-5c',
          width: 1920,
          height: 1080,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
  it('принимает вложения без blur_hash/width/height (documents)', () => {
    const result = createMessageBodySchema.safeParse({
      attachments: [
        {
          storagePath: 'support/t1/m1/file.txt',
          storageUrl: '/support/files/support%2Ft1%2Fm1%2Ffile.txt',
          fileName: 'file.txt',
          fileType: 'text/plain',
          fileSize: 100,
          blur_hash: null,
          width: null,
          height: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('updateTicketBodySchema', () => {
  it('трансформирует resolved в closed', () => {
    const result = updateTicketBodySchema.safeParse({ status: 'resolved' });
    expect(result.success).toBe(true);
    expect(result.success ? result.data.status : '').toBe('closed');
  });
  it('принимает assignedTo с UUID или null', () => {
    expect(updateTicketBodySchema.safeParse({ assignedTo: VALID_UUID }).success).toBe(true);
    expect(updateTicketBodySchema.safeParse({ assignedTo: null }).success).toBe(true);
  });
});

describe('ticketMessagesQuerySchema', () => {
  it('использует дефолты и ограничивает limit/offset', () => {
    const result = ticketMessagesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success ? result.data.limit : 0).toBe(100);
    const r2 = ticketMessagesQuerySchema.safeParse({ limit: '999' });
    expect(r2.success).toBe(true);
    expect(r2.success ? r2.data.limit : 0).toBe(500);
  });
});

describe('grantRoleBodySchema', () => {
  it('принимает userId и role support/admin', () => {
    expect(grantRoleBodySchema.safeParse({ userId: VALID_UUID, role: 'support' }).success).toBe(
      true,
    );
  });
  it('отклоняет невалидный UUID или роль', () => {
    expect(grantRoleBodySchema.safeParse({ userId: INVALID_UUID, role: 'admin' }).success).toBe(
      false,
    );
    expect(grantRoleBodySchema.safeParse({ userId: VALID_UUID, role: 'moderator' }).success).toBe(
      false,
    );
  });
});

describe('adminUsersQuerySchema', () => {
  it('дефолты и limit 1-100', () => {
    const result = adminUsersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success ? result.data.limit : 0).toBe(50);
    const r2 = adminUsersQuerySchema.safeParse({ limit: '200' });
    expect(r2.success).toBe(true);
    expect(r2.success ? r2.data.limit : 0).toBe(100);
  });
});

describe('maintenanceBodySchema', () => {
  it('принимает валидные данные или пустой объект', () => {
    expect(
      maintenanceBodySchema.safeParse({ isActive: true, message: 'Maintenance' }).success,
    ).toBe(true);
    expect(maintenanceBodySchema.safeParse({}).success).toBe(true);
  });
});

describe('createCommentBodySchema', () => {
  it('принимает content, отклоняет пустой или слишком длинный', () => {
    expect(createCommentBodySchema.safeParse({ content: 'Hello' }).success).toBe(true);
    expect(createCommentBodySchema.safeParse({ content: '' }).success).toBe(false);
    expect(createCommentBodySchema.safeParse({ content: 'a'.repeat(1001) }).success).toBe(false);
  });
});

describe('UUID param schemas', () => {
  it('ticketIdParamSchema, userIdParamSchema, deviceIdParamSchema', () => {
    expect(ticketIdParamSchema.safeParse({ ticketId: VALID_UUID }).success).toBe(true);
    expect(ticketIdParamSchema.safeParse({ ticketId: INVALID_UUID }).success).toBe(false);
    expect(userIdParamSchema.safeParse({ user_id: '1234567' }).success).toBe(true);
    expect(deviceIdParamSchema.safeParse({ deviceId: VALID_UUID }).success).toBe(true);
    expect(trustedDeveloperIdQuerySchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });
});
