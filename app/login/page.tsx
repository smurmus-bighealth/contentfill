'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  // AccessDenied is the generic code returned by our signIn callback.
  // We don't distinguish "wrong space" from "no Contentful account" to avoid
  // leaking which specific check failed to the browser.
  AccessDenied: 'Access denied. Ensure your Contentful account has access to this space.',
  RefreshTokenError: 'Your session expired. Please sign in again.',
  OAuthSignin: 'Could not start the sign-in flow. Please try again.',
  OAuthCallback: 'Something went wrong during sign-in. Please try again.',
  Default: 'Sign-in failed. Please try again.',
};

function LoginContent() {
  const params = useSearchParams();
  const error = params.get('error') ?? undefined;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default) : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm flex flex-col gap-6">
        {/* Logo / wordmark */}
        <div className="text-center">
          <div className="text-2xl font-semibold tracking-tight text-gray-900 mb-1">
            contentfill
          </div>
          <p className="text-sm text-gray-500">
            Contentful bulk migration tool
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Sign-in button */}
        <button
          onClick={() => signIn('contentful', { callbackUrl: '/' })}
          className="flex items-center justify-center gap-3 w-full rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium py-2.5 px-4 transition-colors"
        >
          <ContentfulLogo />
          Sign in with Contentful
        </button>

        <p className="text-xs text-center text-gray-400 leading-relaxed">
          You must be a member of the configured Contentful space with
          content management permissions.
        </p>
      </div>
    </main>
  );
}

function ContentfulLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 128 128" fill="none" aria-hidden="true">
      <circle cx="64" cy="64" r="64" fill="white" fillOpacity="0.2" />
      <path
        d="M47.5 38.5C41.7 44.3 38 52.3 38 61.2c0 8.9 3.7 16.9 9.5 22.7l8.5-8.5C51.9 71.3 49.5 66.5 49.5 61.2c0-5.3 2.4-10.1 6.5-14.2L47.5 38.5z"
        fill="white"
      />
      <path
        d="M80.5 89.5C86.3 83.7 90 75.7 90 66.8c0-8.9-3.7-16.9-9.5-22.7l-8.5 8.5c4.1 4.1 6.5 8.9 6.5 14.2 0 5.3-2.4 10.1-6.5 14.2l8.5 8.5z"
        fill="white"
      />
      <circle cx="44" cy="39" r="8" fill="white" />
      <circle cx="84" cy="89" r="8" fill="white" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
