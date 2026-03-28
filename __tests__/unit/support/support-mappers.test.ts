import { describe, it, expect } from 'vitest';
import {
  mapRawAttachmentToUi,
  mapWsAttachmentToUi,
  mapWsAttachments,
  mapRawMessageToUi,
  mapRawTicketToUi,
  mapRawTicketsToUi,
  mapRawTicketWithMessagesToUi,
} from '@/lib/utils/support-mappers';
import type { RawAttachmentApi, RawMessageApi, RawTicketApi } from '@/lib/types/support-api';

const sampleAttachment: RawAttachmentApi = {
  id: 'att-1',
  file_name: 'screenshot.png',
  file_type: 'image/png',
  file_size: 2048,
  storage_path: 'support/ticket1/msg1/screenshot.png',
  blur_hash: 'LGF5]+Yk^6#M@-5c',
  width: 800,
  height: 600,
};

const sampleSender = {
  id: 'user-uuid-1',
  username: 'testuser',
  user_id: '123456',
  avatar: 's3:avatars/123/test.png',
};

const sampleMessage: RawMessageApi = {
  id: 'msg-1',
  ticket_id: 'ticket-1',
  sender_id: 'user-uuid-1',
  sender_type: 'user',
  message_text: 'Hello, I need help',
  created_at: '2024-01-15T10:00:00Z',
  is_read: true,
  sender: sampleSender,
  attachments: [sampleAttachment],
};

const sampleTicket: RawTicketApi = {
  id: 'ticket-1',
  user_id: 'user-uuid-1',
  subject: 'Проблема с оплатой',
  status: 'open',
  created_at: '2024-01-15T09:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  unread_count: 2,
  last_message: {
    id: 'msg-1',
    message_text: 'Hello, I need help',
    sender_type: 'user',
    created_at: '2024-01-15T10:00:00Z',
    is_read: false,
    attachments: [sampleAttachment],
  },
};

describe('mapRawAttachmentToUi', () => {
  it('маппит все поля вложения и формирует storage_url из storage_path', () => {
    const result = mapRawAttachmentToUi(sampleAttachment);
    expect(result.id).toBe('att-1');
    expect(result.file_name).toBe('screenshot.png');
    expect(result.storage_url).toBe(
      '/support/files/' + encodeURIComponent('support/ticket1/msg1/screenshot.png'),
    );
  });

  it('пустой storage_url если нет storage_path', () => {
    const att: RawAttachmentApi = { ...sampleAttachment, storage_path: undefined };
    const result = mapRawAttachmentToUi(att);
    expect(result.storage_url).toBe('');
  });
});

describe('mapRawMessageToUi', () => {
  it('маппит сообщение с вложениями и sender', () => {
    const result = mapRawMessageToUi(sampleMessage);
    expect(result.id).toBe('msg-1');
    expect(result.text).toBe('Hello, I need help');
    expect(result.sender).toBe('user');
    expect(result.senderData?.username).toBe('testuser');
    expect(result.attachments).toHaveLength(1);
  });

  it('нормализует sender из массива (relation)', () => {
    const msg: RawMessageApi = { ...sampleMessage, sender: [sampleSender] };
    const result = mapRawMessageToUi(msg);
    expect(result.senderData?.username).toBe('testuser');
  });
});

describe('mapRawTicketToUi', () => {
  it('маппит тикет с основными полями', () => {
    const result = mapRawTicketToUi(sampleTicket);
    expect(result.id).toBe('ticket-1');
    expect(result.subject).toBe('Проблема с оплатой');
    expect(result.status).toBe('open');
  });

  it('по умолчанию messages = []', () => {
    const result = mapRawTicketToUi(sampleTicket);
    expect(result.messages).toEqual([]);
  });
});

describe('mapRawTicketsToUi', () => {
  it('маппит массив тикетов', () => {
    const result = mapRawTicketsToUi([sampleTicket, { ...sampleTicket, id: 'ticket-2' }]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('ticket-1');
    expect(result[1].id).toBe('ticket-2');
  });
});

describe('mapRawTicketWithMessagesToUi', () => {
  it('маппит тикет с сообщениями', () => {
    const result = mapRawTicketWithMessagesToUi(sampleTicket, [sampleMessage]);
    expect(result.id).toBe('ticket-1');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('Hello, I need help');
  });
});

describe('mapWsAttachmentToUi', () => {
  it('uses storage_url when provided (broadcast from tRPC)', () => {
    const att = {
      id: 'att-ws-1',
      file_name: 'img.png',
      file_type: 'image/png',
      file_size: 1024,
      storage_path: 'support/t1/m1/img.png',
      storage_url: '/support/files/support%2Ft1%2Fm1%2Fimg.png',
    };
    const result = mapWsAttachmentToUi(att);
    expect(result.storage_url).toBe('/support/files/support%2Ft1%2Fm1%2Fimg.png');
  });

  it('falls back to buildStorageUrl when storage_url is absent (DB has only storage_path)', () => {
    const att = {
      id: 'att-ws-2',
      file_name: 'doc.pdf',
      file_type: 'application/pdf',
      file_size: 5000,
      storage_path: 'support/t2/m2/doc.pdf',
    };
    const result = mapWsAttachmentToUi(att);
    expect(result.storage_url).toBe(
      '/support/files/' + encodeURIComponent('support/t2/m2/doc.pdf'),
    );
  });

  it('returns empty storage_url when both storage_url and storage_path are missing', () => {
    const att = {
      id: 'att-ws-3',
      file_name: 'nopath.txt',
      file_type: 'text/plain',
      file_size: 100,
    };
    const result = mapWsAttachmentToUi(att);
    expect(result.storage_url).toBe('');
  });

  it('preserves blur_hash, width, height', () => {
    const att = {
      id: 'att-ws-4',
      file_name: 'photo.jpg',
      file_type: 'image/jpeg',
      file_size: 2048,
      storage_path: 'support/t1/m1/photo.jpg',
      blur_hash: 'LGF5]+Yk^6#M@-5c',
      width: 1920,
      height: 1080,
    };
    const result = mapWsAttachmentToUi(att);
    expect(result.blur_hash).toBe('LGF5]+Yk^6#M@-5c');
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });
});

describe('mapWsAttachments', () => {
  it('returns undefined for null/undefined/empty input', () => {
    expect(mapWsAttachments(null)).toBeUndefined();
    expect(mapWsAttachments(undefined)).toBeUndefined();
    expect(mapWsAttachments([])).toBeUndefined();
  });

  it('maps array of WS attachments', () => {
    const atts = [
      {
        id: 'a1',
        file_name: 'f1.png',
        file_type: 'image/png',
        file_size: 100,
        storage_path: 'p/f1.png',
        storage_url: '/support/files/p%2Ff1.png',
      },
      {
        id: 'a2',
        file_name: 'f2.pdf',
        file_type: 'application/pdf',
        file_size: 200,
        storage_path: 'p/f2.pdf',
      },
    ];
    const result = mapWsAttachments(atts);
    expect(result).toHaveLength(2);
    expect(result![0].storage_url).toBe('/support/files/p%2Ff1.png');
    expect(result![1].storage_url).toBe('/support/files/' + encodeURIComponent('p/f2.pdf'));
  });
});
