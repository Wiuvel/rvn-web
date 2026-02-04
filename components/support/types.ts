/**
 * Shared types for support system components.
 */

/**
 * Attachment data for a message.
 */
export interface MessageAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_url: string;
  storage_path?: string;
  blur_hash?: string;
  width?: number;
  height?: number;
}

/**
 * Sender data for support messages.
 */
export interface MessageSender {
  id: string;
  username: string;
  user_id: string;
  avatar?: string | null;
}

/**
 * Message in a support ticket.
 */
export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'support';
  timestamp: Date;
  isRead?: boolean;
  /** Flag for optimistic messages that are still being sent */
  isPending?: boolean;
  senderData?: MessageSender;
  attachments?: MessageAttachment[];
}

/**
 * Last message preview for ticket list.
 */
export interface LastMessagePreview {
  id: string;
  message_text: string;
  sender_type: 'user' | 'support' | 'system';
  created_at: string;
  is_read: boolean;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
  }>;
}

/**
 * Support ticket.
 */
export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'closed' | 'pending';
  createdAt: Date;
  messages: Message[];
  user_id?: string;
  last_message?: LastMessagePreview | null;
  unread_count?: number;
  updated_at?: string;
}

/**
 * Uploaded file data from file upload modal.
 */
export interface UploadedFile {
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  storageUrl: string;
  blur_hash?: string;
  width?: number;
  height?: number;
  previewUrl?: string;
}

/**
 * Date/time formatting functions type.
 */
export interface DateFormatters {
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
  formatDateShort: (date: Date) => string;
}

/**
 * Props for ImageWithBlur component.
 */
export interface ImageWithBlurProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  isRead?: boolean;
  blurHash?: string;
  width?: number;
  height?: number;
  isPending?: boolean;
  onClick?: () => void;
}

/**
 * Props for MessageItem component.
 */
export interface MessageItemProps {
  message: Message;
  showDate: boolean;
  userData: {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
  } | null;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
  isInitialLoad?: boolean;
  onImageClick?: (url: string, alt: string) => void;
}

/**
 * Props for ChatHeader component.
 */
export interface ChatHeaderProps {
  ticket: Ticket;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onBack: () => void;
  formatDateShort: (date: Date) => string;
}

/**
 * Props for MessageInput component.
 */
export interface MessageInputProps {
  messageText: string;
  onMessageChange: (text: string) => void;
  onSend: () => void;
  onAttachClick: () => void;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (index: number) => void;
  isSending: boolean;
  timeoutSeconds: number;
  isTicketClosed: boolean;
  maxLength: number;
}

/**
 * Props for TicketListItem component.
 */
export interface TicketListItemProps {
  ticket: Ticket;
  isActive: boolean;
  onClick: () => void;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
}

/**
 * Props for TicketList component.
 */
export interface TicketListProps {
  tickets: Ticket[];
  activeTicket: Ticket | null;
  onSelectTicket: (ticket: Ticket) => void;
  onCreateTicket: () => void;
  isLoading: boolean;
  skeletonCount: number | null;
  canCreateTicket: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  showNewTicketForm: boolean;
  onToggleNewTicketForm: () => void;
  isSupport: boolean;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
}

/**
 * Props for CreateTicketForm component.
 */
export interface CreateTicketFormProps {
  subject: string;
  message: string;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isCreating: boolean;
  maxSubjectLength: number;
  maxMessageLength: number;
}
