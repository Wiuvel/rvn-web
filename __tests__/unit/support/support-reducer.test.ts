import { describe, it, expect } from 'vitest';
import { supportReducer, initialState } from '@/hooks/useSupportState';
import { UserData } from '@/types';
import { Ticket } from '@/components/support/types';

describe('supportReducer', () => {
  it('should handle SET_USER_DATA', () => {
    const userData: UserData = {
      id: '123',
      user_id: 'user_123',
      created_at: new Date().toISOString(),
      username: 'testuser',
      isSupport: true,
    };
    const newState = supportReducer(initialState, { type: 'SET_USER_DATA', payload: userData });
    expect(newState.userData).toEqual(userData);
    expect(newState.isSupport).toBe(true);
  });

  it('should handle SET_TICKETS', () => {
    const tickets: Ticket[] = [
      { id: '1', subject: 'Test Ticket', status: 'open', createdAt: new Date(), messages: [] },
    ];
    const newState = supportReducer(initialState, { type: 'SET_TICKETS', payload: tickets });
    expect(newState.tickets).toEqual(tickets);
  });

  it('should handle SET_ACTIVE_TICKET', () => {
    const ticket: Ticket = {
      id: '1',
      subject: 'Test Ticket',
      status: 'open',
      createdAt: new Date(),
      messages: [],
    };
    const newState = supportReducer(initialState, { type: 'SET_ACTIVE_TICKET', payload: ticket });
    expect(newState.activeTicket).toEqual(ticket);
  });

  it('should handle UPDATE_ACTIVE_TICKET_MESSAGES', () => {
    const ticket: Ticket = {
      id: '1',
      subject: 'Test',
      status: 'open',
      createdAt: new Date(),
      messages: [],
    };
    let state = supportReducer(initialState, { type: 'SET_ACTIVE_TICKET', payload: ticket });
    const messages = [
      { id: 'm1', text: 'Hello', sender: 'user' as const, timestamp: new Date(), isRead: true },
    ];
    state = supportReducer(state, { type: 'UPDATE_ACTIVE_TICKET_MESSAGES', payload: messages });
    expect(state.activeTicket?.messages).toEqual(messages);
  });

  it('should handle SET_LOADING', () => {
    const newState = supportReducer(initialState, { type: 'SET_LOADING', payload: true });
    expect(newState.loading).toBe(true);
  });

  it('should handle TOGGLE_USER_MENU', () => {
    let newState = supportReducer(initialState, { type: 'TOGGLE_USER_MENU' });
    expect(newState.userMenuOpen).toBe(true);
    newState = supportReducer(newState, { type: 'TOGGLE_USER_MENU' });
    expect(newState.userMenuOpen).toBe(false);
  });

  it('should handle SHOW_NOTIFICATION and HIDE_NOTIFICATION', () => {
    let state = supportReducer(initialState, {
      type: 'SHOW_NOTIFICATION',
      payload: { message: 'Error', type: 'error' },
    });
    expect(state.notification.show).toBe(true);
    state = supportReducer(state, { type: 'HIDE_NOTIFICATION' });
    expect(state.notification.show).toBe(false);
  });

  it('should handle SET_TICKETS with a function payload', () => {
    const ticket: Ticket = {
      id: '1',
      subject: 'T',
      status: 'open',
      createdAt: new Date(),
      messages: [],
    };
    let state = supportReducer(initialState, { type: 'SET_TICKETS', payload: [ticket] });
    state = supportReducer(state, {
      type: 'SET_TICKETS',
      payload: (prev) => [...prev, { ...ticket, id: '2' }],
    });
    expect(state.tickets).toHaveLength(2);
  });

  it('should handle SET_ACTIVE_TICKET with a function payload', () => {
    const ticket: Ticket = {
      id: '1',
      subject: 'T',
      status: 'open',
      createdAt: new Date(),
      messages: [],
    };
    let state = supportReducer(initialState, { type: 'SET_ACTIVE_TICKET', payload: ticket });
    state = supportReducer(state, {
      type: 'SET_ACTIVE_TICKET',
      payload: (prev) => (prev ? { ...prev, status: 'closed' as const } : null),
    });
    expect(state.activeTicket?.status).toBe('closed');
  });

  it('should handle SET_PAGINATION', () => {
    const state = supportReducer(initialState, {
      type: 'SET_PAGINATION',
      payload: { hasMoreMessages: true, loadedMessageCount: 25 },
    });
    expect(state.hasMoreMessages).toBe(true);
    expect(state.loadedMessageCount).toBe(25);
  });

  it('should handle UPDATE_RATE_LIMIT', () => {
    const state = supportReducer(initialState, {
      type: 'UPDATE_RATE_LIMIT',
      payload: { lastMessageTime: 1234567890, messagesSentCount: 2, timeoutSeconds: 15 },
    });
    expect(state.lastMessageTime).toBe(1234567890);
    expect(state.messagesSentCount).toBe(2);
    expect(state.timeoutSeconds).toBe(15);
  });

  it('should return same state for no-op boolean actions', () => {
    const state = supportReducer(initialState, { type: 'SET_LOADING', payload: false });
    expect(state).toBe(initialState);
  });

  it('should handle file upload state', () => {
    let state = supportReducer(initialState, {
      type: 'SET_UPLOADED_FILES',
      payload: [
        {
          fileName: 'test.png',
          fileType: 'image/png',
          fileSize: 1024,
          storagePath: 'p/test.png',
          storageUrl: '/support/files/p%2Ftest.png',
        },
      ],
    });
    expect(state.uploadedFiles).toHaveLength(1);
    state = supportReducer(state, { type: 'SET_UPLOADED_FILES', payload: [] });
    expect(state.uploadedFiles).toHaveLength(0);
  });

  it('should handle SET_VIEWING_IMAGE', () => {
    const state = supportReducer(initialState, {
      type: 'SET_VIEWING_IMAGE',
      payload: { url: '/img.png', alt: 'Test' },
    });
    expect(state.viewingImage?.url).toBe('/img.png');
    const state2 = supportReducer(state, { type: 'SET_VIEWING_IMAGE', payload: null });
    expect(state2.viewingImage).toBeNull();
  });
});
