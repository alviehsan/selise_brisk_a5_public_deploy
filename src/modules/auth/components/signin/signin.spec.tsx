import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GRANT_TYPES } from '@/constant/auth';
import { Signin } from './signin';

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/i18n/language-context', () => ({
  useLanguage: () => ({ language: 'en-US', setLanguage: vi.fn() }),
}));

vi.mock('@/styles/theme/theme-provider', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('../../hooks/use-auth', () => ({
  useGetLoginOptions: () => ({
    data: {
      allowedGrantTypes: [GRANT_TYPES.password, GRANT_TYPES.oidc],
      ssoInfo: [],
    },
  }),
  useGetSignupSettings: () => ({
    data: {
      isEmailPasswordSignUpEnabled: false,
      isSSoSignUpEnabled: false,
    },
  }),
}));

vi.mock('../signin-email', () => ({
  SigninEmail: () => <div>Email login form</div>,
}));

vi.mock('../signin-sso', () => ({
  SsoSignin: () => <div>Social login options</div>,
}));

vi.mock('../signin-oidc', () => ({
  SigninOidc: () => <button>Log in with Blocks</button>,
}));

describe('Signin', () => {
  it('shows the Blocks OIDC option when authorization code login is allowed', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Signin />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Log in with Blocks' })).toBeInTheDocument();
  });
});
