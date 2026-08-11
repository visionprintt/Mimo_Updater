'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signUp, signInWithGoogle, isAdmin } from '@/lib/auth';
import './admin-login.css';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailLoading(true);

    const cleanedEmail = email.trim().toLowerCase();

    try {
      let user;

      // Handle designated admin credentials (admin@mimo.com / 0987)
      if (cleanedEmail === 'admin@mimo.com' && password === '0987') {
        try {
          // Attempt direct sign in first
          user = await signIn(cleanedEmail, password);
        } catch (initialErr) {
          try {
            // Fall back to padded password since Firebase Auth mandates >= 6 chars
            user = await signIn(cleanedEmail, '0987_admin');
          } catch (signInErr) {
            try {
              // Automatically onboard the admin account in Firebase Auth & Firestore with padded password
              user = await signUp(
                cleanedEmail,
                '0987_admin',
                'MIMO Admin',
                'admin',
                ['Management'],
                '0000000000',
                '',
                ''
              );
            } catch (signUpErr: unknown) {
              // If email already existed in Auth with another fallback password, try fallback variants
              try {
                user = await signIn(cleanedEmail, '098700');
              } catch (fallbackErr) {
                try {
                  user = await signIn(cleanedEmail, 'admin123');
                } catch (finalErr) {
                  throw new Error('Unable to authenticate Admin account. Please contact system support.');
                }
              }
            }
          }
        }
      } else {
        // Standard authentication for other registered admins
        user = await signIn(email.trim(), password);
      }

      if (!user || !isAdmin(user.role)) {
        setError('Access Denied: Your account does not have Admin privileges.');
        setEmailLoading(false);
        return;
      }

      router.push('/admin/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      if (message.includes('auth/invalid-credential') || message.includes('auth/user-not-found') || message.includes('auth/wrong-password')) {
        setError('Invalid email or password.');
      } else if (message === 'ACCOUNT_REJECTED' || message === 'ACCOUNT_SUSPENDED' || message === 'PENDING_APPROVAL') {
        setError('Access Denied: Your account status is restricted.');
      } else {
        setError(message);
      }
      setEmailLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);

    try {
      const user = await signInWithGoogle();
      if (!user || !isAdmin(user.role)) {
        setError('Access Denied: Your Google account is not authorized for Admin access.');
        setGoogleLoading(false);
        return;
      }
      router.push('/admin/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google Login failed';
      setError(message);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="admin-login-wrapper">
      <div className={`admin-login-bg-image ${isPasswordFocused ? 'password-focused' : ''}`}></div>

      <div className="admin-login-card">
        {/* Left section containing the Admin Login Form */}
        <div className="admin-login-left">
          <div className="admin-login-header">
            <h1 className="admin-login-title">
              Welcome
              <span>Admin</span>
            </h1>
          </div>

          {error && <div className="admin-error-msg">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="admin-form-group">
              <label className="admin-label" htmlFor="admin-email">
                Login, email or phone number
              </label>
              <div className="admin-input-wrapper">
                <span className="input-left-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </span>
                <input
                  id="admin-email"
                  type="text"
                  className="admin-input"
                  placeholder="Enter your email or phone number"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="admin-form-group">
              <label className="admin-label" htmlFor="admin-password">
                Password
              </label>
              <div className="admin-input-wrapper">
                <span className="input-left-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  className="admin-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  required
                />
                <button
                  type="button"
                  className="admin-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="admin-login-btn"
              disabled={emailLoading || googleLoading}
            >
              {emailLoading ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <div className="admin-divider">
            <span>or log in with</span>
          </div>

          <button
            type="button"
            className="admin-google-btn"
            onClick={handleGoogleSignIn}
            disabled={emailLoading || googleLoading}
          >
            {googleLoading ? (
              <span>Connecting...</span>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <div className="admin-footer">
            <p>
              Software Designed & Developed by{' '}
              <button
                type="button"
                className="admin-footer-btn"
                onClick={() => router.push('/admin-login')}
                title="Admin Portal"
              >
                زافرين عفيفة
              </button>
            </p>
            <p>© 2026 Vision Printt Technologies. All Rights Reserved.</p>
          </div>
        </div>

        {/* Right section containing the background and wavy divider */}
        <div className={`admin-login-right ${isPasswordFocused ? 'password-focused' : ''}`}>
          <svg className="admin-wave-layer admin-wave-3" viewBox="0 0 100 1000" preserveAspectRatio="none">
            <path d="M0,0 L60,0 C30,150 90,300 20,450 C-10,550 70,750 40,1000 L0,1000 Z" fill="currentColor" />
          </svg>
          <svg className="admin-wave-layer admin-wave-2" viewBox="0 0 100 1000" preserveAspectRatio="none">
            <path d="M0,0 L60,0 C30,150 90,300 20,450 C-10,550 70,750 40,1000 L0,1000 Z" fill="currentColor" />
          </svg>
          <svg className="admin-wave-layer admin-wave-1" viewBox="0 0 100 1000" preserveAspectRatio="none">
            <path d="M0,0 L60,0 C30,150 90,300 20,450 C-10,550 70,750 40,1000 L0,1000 Z" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  );
}
