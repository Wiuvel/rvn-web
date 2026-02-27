import { describe, it, expect } from 'vitest';
import {
  getLastMessageLabelForAttachments,
  messageTextForBubble,
  normalizeLastMessageDisplayText,
} from '@/lib/utils/support-messages';
import {
  LAST_MESSAGE_LABEL_PHOTO,
  LAST_MESSAGE_LABEL_FILE,
  LAST_MESSAGE_LABEL_ATTACHMENTS,
} from '@/lib/utils/constants';

describe('support-messages utils', () => {
  describe('getLastMessageLabelForAttachments', () => {
    it('should return empty string for empty attachments', () => {
      expect(getLastMessageLabelForAttachments([])).toBe('');
    });

    it('should return PHOTO label for image-only attachments', () => {
      const attachments = [{ file_type: 'image/png' }, { fileType: 'image/jpeg' }];
      expect(getLastMessageLabelForAttachments(attachments)).toBe(LAST_MESSAGE_LABEL_PHOTO);
    });

    it('should return FILE label for non-image attachments', () => {
      const attachments = [{ file_type: 'application/pdf' }, { fileType: 'text/plain' }];
      expect(getLastMessageLabelForAttachments(attachments)).toBe(LAST_MESSAGE_LABEL_FILE);
    });

    it('should return ATTACHMENTS label for mixed attachments', () => {
      const attachments = [{ file_type: 'image/png' }, { file_type: 'application/pdf' }];
      expect(getLastMessageLabelForAttachments(attachments)).toBe(LAST_MESSAGE_LABEL_ATTACHMENTS);
    });
  });

  describe('messageTextForBubble', () => {
    it('should return original text if no attachments', () => {
      expect(messageTextForBubble('Hello', false)).toBe('Hello');
    });

    it('should return empty string if text is only a placeholder', () => {
      expect(messageTextForBubble(LAST_MESSAGE_LABEL_PHOTO, true)).toBe('');
      expect(messageTextForBubble(LAST_MESSAGE_LABEL_FILE, true)).toBe('');
    });

    it('should return empty string if text matches placeholder pattern', () => {
      expect(messageTextForBubble('1 фотография', true)).toBe('');
      expect(messageTextForBubble('2 файла', true)).toBe('');
      expect(messageTextForBubble('5 вложений', true)).toBe('');
    });

    it('should return text if it contains user message', () => {
      expect(messageTextForBubble('Check this photo', true)).toBe('Check this photo');
      expect(messageTextForBubble('📷 Here is the screenshot', true)).toBe(
        '📷 Here is the screenshot',
      );
    });

    it('should strip emoji prefix and check for placeholder', () => {
      // "📷 Фотография" -> should be empty
      expect(messageTextForBubble('📷 Фотография', true)).toBe('');
      // "📎 Файл" -> should be empty
      expect(messageTextForBubble('📎 Файл', true)).toBe('');
    });
  });

  describe('normalizeLastMessageDisplayText', () => {
    it('should remove emoji prefix', () => {
      expect(normalizeLastMessageDisplayText('📷 Photo')).toBe('Photo');
      expect(normalizeLastMessageDisplayText('📎 File')).toBe('File');
    });

    it('should normalize placeholder text', () => {
      expect(normalizeLastMessageDisplayText('5 фотографий')).toBe(LAST_MESSAGE_LABEL_PHOTO);
      expect(normalizeLastMessageDisplayText('2 файла')).toBe(LAST_MESSAGE_LABEL_FILE);
      expect(normalizeLastMessageDisplayText('3 вложения')).toBe(LAST_MESSAGE_LABEL_ATTACHMENTS);
    });

    it('should normalize single item placeholder', () => {
      expect(normalizeLastMessageDisplayText(`1 ${LAST_MESSAGE_LABEL_PHOTO}`)).toBe(
        LAST_MESSAGE_LABEL_PHOTO,
      );
      expect(normalizeLastMessageDisplayText(`1 ${LAST_MESSAGE_LABEL_FILE}`)).toBe(
        LAST_MESSAGE_LABEL_FILE,
      );
    });

    it('should keep user text', () => {
      expect(normalizeLastMessageDisplayText('Hello world')).toBe('Hello world');
    });
  });
});
