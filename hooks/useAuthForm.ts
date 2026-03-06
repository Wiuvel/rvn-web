import { useReducer } from 'react';

type AuthState = {
  currentTab: 'login' | 'register';
  isLoading: boolean;
  isPopupOpen: boolean;
  activeProvider: string | null;
  isTransitioning: boolean;
  globalError: string;
  loginAttemptState: 'idle' | 'error';
  isPasswordValid: {
    register: boolean;
    login: boolean;
  };
  showPasswordStrength: {
    register: boolean;
    login: boolean;
  };
  showPassword: {
    register: boolean;
    login: boolean;
  };
  csrfToken: string;
};

type AuthAction =
  | { type: 'SET_TAB'; payload: 'login' | 'register' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_POPUP_OPEN'; payload: boolean }
  | { type: 'SET_ACTIVE_PROVIDER'; payload: string | null }
  | { type: 'SET_TRANSITIONING'; payload: boolean }
  | { type: 'SET_GLOBAL_ERROR'; payload: string }
  | { type: 'SET_LOGIN_ATTEMPT_STATE'; payload: 'idle' | 'error' }
  | { type: 'SET_PASSWORD_VALID'; payload: { form: 'login' | 'register'; isValid: boolean } }
  | { type: 'SET_SHOW_PASSWORD_STRENGTH'; payload: { form: 'login' | 'register'; show: boolean } }
  | { type: 'TOGGLE_SHOW_PASSWORD'; payload: 'login' | 'register' }
  | { type: 'SET_CSRF_TOKEN'; payload: string }
  | { type: 'RESET_FORM' };

const initialState: AuthState = {
  currentTab: 'login',
  isLoading: false,
  isPopupOpen: false,
  activeProvider: null,
  isTransitioning: false,
  globalError: '',
  loginAttemptState: 'idle',
  isPasswordValid: { register: false, login: false },
  showPasswordStrength: { register: false, login: false },
  showPassword: { register: false, login: false },
  csrfToken: '',
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, currentTab: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_POPUP_OPEN':
      return { ...state, isPopupOpen: action.payload };
    case 'SET_ACTIVE_PROVIDER':
      return { ...state, activeProvider: action.payload };
    case 'SET_TRANSITIONING':
      return { ...state, isTransitioning: action.payload };
    case 'SET_GLOBAL_ERROR':
      return { ...state, globalError: action.payload };
    case 'SET_LOGIN_ATTEMPT_STATE':
      return { ...state, loginAttemptState: action.payload };
    case 'SET_PASSWORD_VALID':
      return {
        ...state,
        isPasswordValid: {
          ...state.isPasswordValid,
          [action.payload.form]: action.payload.isValid,
        },
      };
    case 'SET_SHOW_PASSWORD_STRENGTH':
      return {
        ...state,
        showPasswordStrength: {
          ...state.showPasswordStrength,
          [action.payload.form]: action.payload.show,
        },
      };
    case 'TOGGLE_SHOW_PASSWORD':
      return {
        ...state,
        showPassword: {
          ...state.showPassword,
          [action.payload]: !state.showPassword[action.payload],
        },
      };
    case 'SET_CSRF_TOKEN':
      return { ...state, csrfToken: action.payload };
    case 'RESET_FORM':
      return {
        ...state,
        globalError: '',
        isPasswordValid: { register: false, login: false },
        showPasswordStrength: { register: false, login: false },
        isLoading: false,
        loginAttemptState: 'idle',
      };
    default:
      return state;
  }
}

export function useAuthForm(initialTab?: 'login' | 'register') {
  const [state, dispatch] = useReducer(authReducer, {
    ...initialState,
    currentTab: initialTab || initialState.currentTab,
  });

  return { state, dispatch };
}
