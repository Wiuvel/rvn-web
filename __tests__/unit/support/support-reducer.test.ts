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
});
