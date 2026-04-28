import { describe, it, expect } from 'vitest';
import {
  getLastMessageLabelForAttachments,
  messageTextForBubble,
  normalizeLastMessageDisplayText,
} from '@/lib/support/messages';
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
      const attachments = [{ file_type: 'application/pdf' }];
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
    });
    it('should keep user text', () => {
      expect(messageTextForBubble('Check this photo', true)).toBe('Check this photo');
    });
  });

  describe('normalizeLastMessageDisplayText', () => {
    it('should remove emoji prefix', () => {
      expect(normalizeLastMessageDisplayText('📷 Photo')).toBe('Photo');
    });
    it('should normalize placeholder text', () => {
      expect(normalizeLastMessageDisplayText('5 фотографий')).toBe(LAST_MESSAGE_LABEL_PHOTO);
    });
    it('should keep user text', () => {
      expect(normalizeLastMessageDisplayText('Hello world')).toBe('Hello world');
    });
  });
});
