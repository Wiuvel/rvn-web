import { useReducer, useEffect } from 'react';
import { UserData } from '@/types';
import { Ticket, Message, UploadedFile } from '@/components/support/types';
import type { RawTicketApi, RawMessageApi } from '@/lib/support/types';
import { mapRawTicketsToUi, mapRawTicketWithMessagesToUi } from '@/lib/support/mappers';

export interface SupportState {
  userData: UserData | null;
  tickets: Ticket[];
  activeTicket: Ticket | null;
  loading: boolean;
  ticketsLoading: boolean;
  isSupport: boolean;

  /* UI / Modals */
  userMenuOpen: boolean;
  showNewTicketForm: boolean;
  showCreateTicketModal: boolean;
  isCreatingTicket: boolean;
  isSendingMessage: boolean;

  /* Additional UI State */
  showRateLimitCaptcha: boolean;
  ticketsListVisible: boolean;
  sidebarCollapsed: boolean;
  showFileUploadModal: boolean;
  isUploading: boolean;
  viewingImage: { url: string; alt: string } | null;

  /* File Uploads */
  uploadedFiles: UploadedFile[];
  filePreviews: Map<string, string>;
  fileErrors: Set<string>;

  /* Inputs */
  messageText: string;
  newTicketSubject: string;
  newTicketMessage: string;

  /* Rate Limiting */
  lastMessageTime: number | null;
  timeoutSeconds: number;
  messagesSentCount: number;

  /* Notifications */
  notification: { message: string; show: boolean; type?: 'error' | 'info' };

  /* Pagination */
  hasMoreMessages: boolean;
  isLoadingOlderMessages: boolean;
  loadedMessageCount: number;

  /* Skeletons */
  skeletonCount: number | null;
}

export type SupportAction =
  | { type: 'SET_USER_DATA'; payload: UserData | null }
  | { type: 'SET_TICKETS'; payload: Ticket[] | ((prev: Ticket[]) => Ticket[]) }
  | { type: 'SET_ACTIVE_TICKET'; payload: Ticket | null | ((prev: Ticket | null) => Ticket | null) }
  | { type: 'UPDATE_ACTIVE_TICKET_MESSAGES'; payload: Message[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_TICKETS_LOADING'; payload: boolean }
  | { type: 'TOGGLE_USER_MENU'; payload?: boolean }
  | { type: 'SET_SHOW_NEW_TICKET_FORM'; payload: boolean }
  | { type: 'SET_SHOW_CREATE_TICKET_MODAL'; payload: boolean }
  | { type: 'SET_IS_CREATING_TICKET'; payload: boolean }
  | { type: 'SET_IS_SENDING_MESSAGE'; payload: boolean }
  | { type: 'SET_MESSAGE_TEXT'; payload: string }
  | { type: 'SET_NEW_TICKET_SUBJECT'; payload: string }
  | { type: 'SET_NEW_TICKET_MESSAGE'; payload: string }
  | {
      type: 'UPDATE_RATE_LIMIT';
      payload: Partial<
        Pick<SupportState, 'lastMessageTime' | 'timeoutSeconds' | 'messagesSentCount'>
      >;
    }
  | { type: 'SHOW_NOTIFICATION'; payload: { message: string; type?: 'error' | 'info' } }
  | { type: 'HIDE_NOTIFICATION' }
  | {
      type: 'SET_PAGINATION';
      payload: Partial<
        Pick<SupportState, 'hasMoreMessages' | 'isLoadingOlderMessages' | 'loadedMessageCount'>
      >;
    }
  | { type: 'SET_SKELETON_COUNT'; payload: number | null }
  /* Additional Actions */
  | { type: 'SET_SHOW_RATE_LIMIT_CAPTCHA'; payload: boolean }
  | { type: 'SET_TICKETS_LIST_VISIBLE'; payload: boolean }
  | { type: 'SET_SIDEBAR_COLLAPSED'; payload: boolean }
  | { type: 'SET_SHOW_FILE_UPLOAD_MODAL'; payload: boolean }
  | { type: 'SET_IS_UPLOADING'; payload: boolean }
  | { type: 'SET_UPLOADED_FILES'; payload: UploadedFile[] }
  | { type: 'SET_FILE_PREVIEWS'; payload: Map<string, string> }
  | { type: 'SET_FILE_ERRORS'; payload: Set<string> }
  | { type: 'SET_VIEWING_IMAGE'; payload: { url: string; alt: string } | null };

export const initialState: SupportState = {
  userData: null,
  tickets: [],
  activeTicket: null,
  loading: false,
  ticketsLoading: false,
  isSupport: false,
  userMenuOpen: false,
  showNewTicketForm: false,
  showCreateTicketModal: false,
  isCreatingTicket: false,
  isSendingMessage: false,
  messageText: '',
  newTicketSubject: '',
  newTicketMessage: '',
  lastMessageTime: null,
  timeoutSeconds: 0,
  messagesSentCount: 0,
  notification: { message: '', show: false, type: 'error' },
  hasMoreMessages: false,
  isLoadingOlderMessages: false,
  loadedMessageCount: 0,
  skeletonCount: 3,
  // Additional Initial State
  showRateLimitCaptcha: false,
  ticketsListVisible: false,
  sidebarCollapsed: false,
  showFileUploadModal: false,
  isUploading: false,
  uploadedFiles: [],
  filePreviews: new Map(),
  fileErrors: new Set(),
  viewingImage: null,
};

export function supportReducer(state: SupportState, action: SupportAction): SupportState {
  switch (action.type) {
    case 'SET_USER_DATA':
      return { ...state, userData: action.payload, isSupport: action.payload?.isSupport === true };
    case 'SET_TICKETS':
      return {
        ...state,
        tickets:
          typeof action.payload === 'function' ? action.payload(state.tickets) : action.payload,
      };
    case 'SET_ACTIVE_TICKET':
      return {
        ...state,
        activeTicket:
          typeof action.payload === 'function'
            ? action.payload(state.activeTicket)
            : action.payload,
      };
    case 'UPDATE_ACTIVE_TICKET_MESSAGES':
      return state.activeTicket
        ? { ...state, activeTicket: { ...state.activeTicket, messages: action.payload } }
        : state;
    case 'SET_LOADING':
      if (state.loading === action.payload) return state;
      return { ...state, loading: action.payload };
    case 'SET_TICKETS_LOADING':
      if (state.ticketsLoading === action.payload) return state;
      return { ...state, ticketsLoading: action.payload };
    case 'TOGGLE_USER_MENU':
      const newUserMenuOpen = action.payload ?? !state.userMenuOpen;
      if (state.userMenuOpen === newUserMenuOpen) return state;
      return { ...state, userMenuOpen: newUserMenuOpen };
    case 'SET_SHOW_NEW_TICKET_FORM':
      if (state.showNewTicketForm === action.payload) return state;
      return { ...state, showNewTicketForm: action.payload };
    case 'SET_SHOW_CREATE_TICKET_MODAL':
      if (state.showCreateTicketModal === action.payload) return state;
      return { ...state, showCreateTicketModal: action.payload };
    case 'SET_IS_CREATING_TICKET':
      if (state.isCreatingTicket === action.payload) return state;
      return { ...state, isCreatingTicket: action.payload };
    case 'SET_IS_SENDING_MESSAGE':
      if (state.isSendingMessage === action.payload) return state;
      return { ...state, isSendingMessage: action.payload };
    case 'SET_MESSAGE_TEXT':
      if (state.messageText === action.payload) return state;
      return { ...state, messageText: action.payload };
    case 'SET_NEW_TICKET_SUBJECT':
      if (state.newTicketSubject === action.payload) return state;
      return { ...state, newTicketSubject: action.payload };
    case 'SET_NEW_TICKET_MESSAGE':
      if (state.newTicketMessage === action.payload) return state;
      return { ...state, newTicketMessage: action.payload };
    case 'UPDATE_RATE_LIMIT':
      return { ...state, ...action.payload };
    case 'SHOW_NOTIFICATION':
      return { ...state, notification: { ...action.payload, show: true } };
    case 'HIDE_NOTIFICATION':
      return { ...state, notification: { ...state.notification, show: false } };
    case 'SET_PAGINATION':
      return { ...state, ...action.payload };
    case 'SET_SKELETON_COUNT':
      if (state.skeletonCount === action.payload) return state;
      return { ...state, skeletonCount: action.payload };
    /* Additional Reducers */
    case 'SET_SHOW_RATE_LIMIT_CAPTCHA':
      if (state.showRateLimitCaptcha === action.payload) return state;
      return { ...state, showRateLimitCaptcha: action.payload };
    case 'SET_TICKETS_LIST_VISIBLE':
      if (state.ticketsListVisible === action.payload) return state;
      return { ...state, ticketsListVisible: action.payload };
    case 'SET_SIDEBAR_COLLAPSED':
      if (state.sidebarCollapsed === action.payload) return state;
      return { ...state, sidebarCollapsed: action.payload };
    case 'SET_SHOW_FILE_UPLOAD_MODAL':
      if (state.showFileUploadModal === action.payload) return state;
      return { ...state, showFileUploadModal: action.payload };
    case 'SET_IS_UPLOADING':
      if (state.isUploading === action.payload) return state;
      return { ...state, isUploading: action.payload };
    case 'SET_UPLOADED_FILES':
      return { ...state, uploadedFiles: action.payload };
    case 'SET_FILE_PREVIEWS':
      return { ...state, filePreviews: action.payload };
    case 'SET_FILE_ERRORS':
      return { ...state, fileErrors: action.payload };
    case 'SET_VIEWING_IMAGE':
      return { ...state, viewingImage: action.payload };
    default:
      return state;
  }
}

export function useSupportState(
  initialUserData: UserData | null,
  initialTickets: RawTicketApi[],
  initialActiveTicket: RawTicketApi | null = null,
  initialMessages: RawMessageApi[] = [],
) {
  const [state, dispatch] = useReducer(
    supportReducer,
    {
      userData: initialUserData,
      tickets: initialTickets,
      activeTicket: initialActiveTicket,
      messages: initialMessages,
    },
    (init) => {
      const rawTickets = (init.tickets || []) as RawTicketApi[];
      const mappedTickets = mapRawTicketsToUi(rawTickets);

      let activeTicket: Ticket | null = null;
      if (init.activeTicket) {
        const rawActive = init.activeTicket as RawTicketApi;
        const rawMessages = (init.messages || []) as RawMessageApi[];
        activeTicket = mapRawTicketWithMessagesToUi(rawActive, rawMessages);
      }

      return {
        ...initialState,
        userData: init.userData,
        tickets: mappedTickets,
        activeTicket,
        isSupport: init.userData?.isSupport === true,
        skeletonCount: 3,
      };
    },
  );

  /* Sync skeleton count on mount */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('support_tickets_count');
      if (cached !== null) {
        const parsed = parseInt(cached, 10);
        if (!isNaN(parsed)) {
          dispatch({ type: 'SET_SKELETON_COUNT', payload: parsed === 0 ? null : parsed });
        }
      }
    }
  }, []);

  return { state, dispatch };
}
