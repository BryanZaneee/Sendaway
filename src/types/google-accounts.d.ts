declare namespace google.accounts.id {
  interface CredentialResponse {
    credential: string;
    select_by: string;
    clientId?: string;
  }

  interface GsiButtonConfiguration {
    type?: 'standard' | 'icon';
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    width?: number;
    logo_alignment?: 'left' | 'center';
    locale?: string;
  }

  interface IdConfiguration {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    login_uri?: string;
    native_callback?: (response: CredentialResponse) => void;
    cancel_on_tap_outside?: boolean;
    prompt_parent_id?: string;
    nonce?: string;
    context?: 'signin' | 'signup' | 'use';
    state_cookie_domain?: string;
    ux_mode?: 'popup' | 'redirect';
    itp_support?: boolean;
  }

  function initialize(config: IdConfiguration): void;
  function renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
  function prompt(): void;
  function disableAutoSelect(): void;
  function cancel(): void;
  function revoke(hint: string, callback?: (done: { successful: boolean; error?: string }) => void): void;
}

interface Window {
  google?: typeof google;
}
