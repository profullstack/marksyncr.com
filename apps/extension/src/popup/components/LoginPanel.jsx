import React, { useState } from 'react';

// Icons
const EmailIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

const LockIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const EyeIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

const EyeOffIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
    />
  </svg>
);

const SpinnerIcon = ({ className = '' }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const UserIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const LogoutIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    />
  </svg>
);

/**
 * Login form component
 */
function LoginForm({ onLogin, onSwitchToSignup, isLoading, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <EmailIcon className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <LockIcon className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            {showPassword ? (
              <EyeOffIcon className="h-5 w-5 text-slate-400 hover:text-slate-600" />
            ) : (
              <EyeIcon className="h-5 w-5 text-slate-400 hover:text-slate-600" />
            )}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center space-x-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <SpinnerIcon className="h-5 w-5" />
            <span>Signing in...</span>
          </>
        ) : (
          <span>Sign In</span>
        )}
      </button>

      <div className="text-center">
        <a
          href="https://marksyncr.com/forgot-password"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          Forgot password?
        </a>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-slate-500">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSwitchToSignup}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Create an account
      </button>
    </form>
  );
}

/**
 * Signup form component
 */
function SignupForm({ onSignup, onSwitchToLogin, isLoading, error, success }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters');
      return;
    }

    onSignup(email, password);
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">Check your email</h3>
        <p className="text-sm text-slate-500">
          We've sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
        </p>
        <button
          onClick={onSwitchToLogin}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {(error || validationError) && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error || validationError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <EmailIcon className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <LockIcon className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            {showPassword ? (
              <EyeOffIcon className="h-5 w-5 text-slate-400 hover:text-slate-600" />
            ) : (
              <EyeIcon className="h-5 w-5 text-slate-400 hover:text-slate-600" />
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">At least 8 characters</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Confirm Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <LockIcon className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center space-x-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <SpinnerIcon className="h-5 w-5" />
            <span>Creating account...</span>
          </>
        ) : (
          <span>Create Account</span>
        )}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-slate-500">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSwitchToLogin}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Already have an account? Sign in
      </button>
    </form>
  );
}

/**
 * User profile component (shown when logged in)
 */
export function UserProfile({ user, subscription, onLogout, isLoading }) {
  const planLabels = {
    free: 'Free',
    pro: 'Pro',
    team: 'Team',
  };

  const planColors = {
    free: 'bg-slate-100 text-slate-700',
    pro: 'bg-amber-100 text-amber-700',
    team: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
            <UserIcon className="h-5 w-5 text-primary-600" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {user.email}
          </p>
          <div className="flex items-center space-x-2 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${planColors[subscription?.plan] || planColors.free}`}>
              {planLabels[subscription?.plan] || 'Free'}
            </span>
            {subscription?.status === 'active' && subscription?.plan !== 'free' && (
              <span className="text-xs text-green-600">Active</span>
            )}
          </div>
        </div>
      </div>

      {(!subscription || subscription.plan === 'free') && (
        <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
          <p className="text-sm font-medium text-amber-800">Upgrade to Pro</p>
          <p className="text-xs text-amber-600 mt-1">
            Get smart search, duplicate detection, link health scanning, and more.
          </p>
          <a
            href="https://marksyncr.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center mt-2 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700"
          >
            View Plans
          </a>
        </div>
      )}

      <div className="space-y-2">
        <a
          href="https://marksyncr.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Open Dashboard
        </a>

        <button
          onClick={onLogout}
          disabled={isLoading}
          className="flex items-center justify-center w-full space-x-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          {isLoading ? (
            <SpinnerIcon className="h-4 w-4" />
          ) : (
            <LogoutIcon className="h-4 w-4" />
          )}
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Main Login Panel component
 */
export function LoginPanel({
  user,
  subscription,
  onLogin,
  onSignup,
  onLogout,
  isLoading,
  error,
  signupSuccess,
}) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'

  if (user) {
    return (
      <UserProfile
        user={user}
        subscription={subscription}
        onLogout={onLogout}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-900">
          {mode === 'login' ? 'Sign in to MarkSyncr' : 'Create your account'}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {mode === 'login'
            ? 'Sync your bookmarks across all your devices'
            : 'Start syncing your bookmarks today'}
        </p>
      </div>

      {mode === 'login' ? (
        <LoginForm
          onLogin={onLogin}
          onSwitchToSignup={() => setMode('signup')}
          isLoading={isLoading}
          error={error}
        />
      ) : (
        <SignupForm
          onSignup={onSignup}
          onSwitchToLogin={() => setMode('login')}
          isLoading={isLoading}
          error={error}
          success={signupSuccess}
        />
      )}
    </div>
  );
}

export default LoginPanel;
