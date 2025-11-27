// Timeouts
export const AUTH_FETCH_TIMEOUT = 10000; // 10 seconds
export const MESSAGE_TIMEOUT = 60000; // 1 minute
export const RATE_LIMIT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour
export const RATE_LIMIT_IMMUNITY_DURATION = 15 * 60 * 1000; // 15 minutes - иммунитет после прохождения капчи

// Delays
export const REDIRECT_DELAY = 1000; // 1 second
export const ANIMATION_DELAY = 250; // 250ms
export const RESIZE_DEBOUNCE = 100; // 100ms

// Character limits
export const TICKET_SUBJECT_MAX_LENGTH = 50;
export const MESSAGE_MAX_LENGTH = 500;

// Ticket limits
export const MAX_TICKETS_PER_USER = 2;

// GSAP animation defaults
export const GSAP_DEFAULT_DURATION = 0.5;
export const GSAP_DEFAULT_EASE = "power2.out";
export const GSAP_STAGGER_DELAY = 0.1;

// Scroll trigger defaults
export const SCROLL_TRIGGER_START = "top 85%";
export const SCROLL_TRIGGER_END = "bottom 15%";

// API Error Messages (English - для серверной части)
export const ERROR_TOO_MANY_LOGIN_ATTEMPTS = 'Too many login attempts. Please try again later.';
export const ERROR_TOO_MANY_REGISTRATION_ATTEMPTS = 'Too many registration attempts. Please try again later.';
export const ERROR_TOO_MANY_REQUESTS = 'Too many requests';
export const ERROR_INVALID_REQUEST_DATA = 'Invalid request data';
export const ERROR_INVALID_USERNAME_FORMAT = 'Invalid username format';
export const ERROR_INVALID_PASSWORD_FORMAT = 'Invalid password format';
export const ERROR_INVALID_REQUEST = 'Invalid request';
export const ERROR_INVALID_REQUEST_REFRESH = 'Invalid request. Please refresh the page.';
export const ERROR_INVALID_REQUEST_REFRESH_AGAIN = 'Invalid request. Please refresh the page and try again.';
export const ERROR_AUTHENTICATION_FAILED = 'Authentication failed';
export const ERROR_INVALID_CREDENTIALS = 'Invalid credentials';
export const ERROR_ACCOUNT_DISABLED = 'Account is disabled';
export const ERROR_PASSWORDS_DO_NOT_MATCH = 'Passwords do not match';
export const ERROR_FAILED_TO_CREATE_ACCOUNT = 'Failed to create account';
export const ERROR_INTERNAL_SERVER_ERROR = 'Internal server error';
export const ERROR_NOT_AUTHENTICATED = 'Not authenticated';
export const ERROR_USER_NOT_FOUND = 'User not found';
export const ERROR_DATABASE_NOT_CONFIGURED = 'Database not configured';
export const ERROR_DATABASE_ERROR = 'Database ERROR';
export const ERROR_UNEXPECTED = 'Unexpected error';

// Support API Error Messages
export const ERROR_TICKET_NOT_FOUND = 'Ticket not found';
export const ERROR_ACCESS_DENIED = 'Access denied';
export const ERROR_CANNOT_SEND_TO_CLOSED_TICKET = 'Cannot send message to closed ticket';
export const ERROR_MESSAGE_TOO_LONG = 'Message too long';
export const ERROR_INVALID_STATUS_TRANSITION = 'Invalid status transition';
export const ERROR_TICKET_NOT_ASSIGNED = 'Ticket must be assigned to you to change status';
export const ERROR_SUBJECT_TOO_LONG = 'Subject too long';
export const ERROR_MAXIMUM_TICKET_LIMIT_REACHED = 'Maximum ticket limit reached';

// API Error Messages (Russian - для клиентской части через error-translations)
export const ERROR_DEFAULT = 'Произошла ошибка';

