/**
 * Утилиты для текста last_message и отображения сообщений поддержки.
 * last_message в списке тикетов показывает «Фотография»/«Файл»/«Вложения»;
 * в пузыре сообщения в чате этот текст не дублируется.
 */

import {
  LAST_MESSAGE_LABEL_PHOTO,
  LAST_MESSAGE_LABEL_FILE,
  LAST_MESSAGE_LABEL_ATTACHMENTS,
} from '@/lib/utils/constants';

const PLACEHOLDER_PATTERN =
  /^\d+\s+(?:фотографи(?:й|я|и)|файл(?:ов|а)?|вложени(?:й|е|я)|изображени(?:й|е|я)|документ(?:ов|а)?)/i;
const EMOJI_PREFIX = /^(?:\uD83D\uDCF7|\uD83D\uDCCE)\s*/;

function isPlaceholderOnly(t: string): boolean {
  return (
    t === LAST_MESSAGE_LABEL_PHOTO ||
    t === LAST_MESSAGE_LABEL_FILE ||
    t === LAST_MESSAGE_LABEL_ATTACHMENTS
  );
}

function isImage(item: { file_type?: string; fileType?: string }): boolean {
  const type = item.file_type ?? item.fileType ?? '';
  return type.startsWith('image/');
}

/**
 * Возвращает подпись для last_message по типу вложений (только для списка тикетов).
 */
export function getLastMessageLabelForAttachments(
  attachments: Array<{ file_type?: string; fileType?: string }>,
): string {
  if (attachments.length === 0) return '';
  const images = attachments.filter(isImage);
  const files = attachments.filter((a) => !isImage(a));
  if (images.length > 0 && files.length === 0) return LAST_MESSAGE_LABEL_PHOTO;
  if (files.length > 0 && images.length === 0) return LAST_MESSAGE_LABEL_FILE;
  return LAST_MESSAGE_LABEL_ATTACHMENTS;
}

/**
 * Текст для пузыря сообщения: не показывать плейсхолдер «Фотография»/«Файл»/«Вложения»
 * в теле сообщения (они только в last_message в списке).
 */
export function messageTextForBubble(text: string, hasAttachments: boolean): string {
  if (!hasAttachments || !text) return text || '';
  const t = text.replace(EMOJI_PREFIX, '').trim();
  if (isPlaceholderOnly(t)) return '';
  if (PLACEHOLDER_PATTERN.test(t)) return '';
  return text;
}

/**
 * Нормализует текст last_message для отображения в списке (убирает эмодзи, «N фотографий» → «Фотография»).
 */
export function normalizeLastMessageDisplayText(text: string): string {
  let out = text.replace(EMOJI_PREFIX, '');
  out = out.replace(PLACEHOLDER_PATTERN, (m) => {
    if (/фотографи|изображени/i.test(m)) return LAST_MESSAGE_LABEL_PHOTO;
    if (/файл|документ/i.test(m)) return LAST_MESSAGE_LABEL_FILE;
    return LAST_MESSAGE_LABEL_ATTACHMENTS;
  });
  const oneLabelPattern = new RegExp(
    `^1\\s+(${LAST_MESSAGE_LABEL_PHOTO}|${LAST_MESSAGE_LABEL_FILE})$`,
  );
  out = out.replace(oneLabelPattern, '$1').trim();
  return out;
}
