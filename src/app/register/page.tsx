'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUp, signInWithGoogle, isAdmin } from '@/lib/auth';
import { DEPARTMENTS, type Department, type UserRole } from '@/types';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [departments, setDepartments] = useState<Department[]>(['Frontend']);
  const [internshipStartDate, setInternshipStartDate] = useState('');
  const [internshipEndDate, setInternshipEndDate] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleAdminLogin = () => {
    router.push('/admin-login');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setEmailLoading(true);

    try {
      await signUp(email, password, name, role, departments, phoneNumber, internshipStartDate, internshipEndDate);
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';

      if (message.includes('auth/email-already-in-use')) {
        setError('This email is already registered.');
      } else if (message.includes('auth/weak-password')) {
        setError('Password is too weak. Use at least 6 characters.');
      } else if (message.includes('auth/invalid-email')) {
        setError('Invalid email address.');
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
      
      if (!user) {
        // Needs onboarding
        router.push('/onboarding');
      } else if (isAdmin(user.role)) {
        router.push('/admin');
      } else {
        router.push('/employee/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google Login failed';
      
      if (message === 'PENDING_APPROVAL') {
        router.push('/pending');
        return;
      }
      if (message === 'ACCOUNT_REJECTED') {
        setError('Your account has been rejected. Please contact HR.');
        setGoogleLoading(false);
        return;
      }
      if (message === 'ACCOUNT_SUSPENDED') {
        setError('Your account has been suspended. Please contact HR.');
        setGoogleLoading(false);
        return;
      }
      
      setError(message);
      setGoogleLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card animate-in">
          <div className="auth-logo">
            <h1>MIMO</h1>
          </div>
          <div className="auth-success">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}></div>
            <h3 style={{ marginBottom: '8px', fontSize: '1.25rem' }}>
              Registration Successful!
            </h3>
            <p>
              Your account is pending admin approval. You&apos;ll be able to log in once
              an admin (HR, Founder, or Co-founder) approves your account.
            </p>
          </div>
          <div className="auth-footer" style={{ marginTop: '24px' }}>
            <Link href="/login">← Back to Login</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card animate-in">
        <div className="auth-logo">
          <h1>MIMO</h1>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              className="form-input"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              className="form-input"
              placeholder="you@mimo.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-phone">
              Phone Number
            </label>
            <input
              id="reg-phone"
              type="tel"
              className="form-input"
              placeholder="9876543210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="role">
              Role
            </label>
            <select
              id="role"
              className="form-select"
              value={role}
              onChange={(e) => {
                const r = e.target.value as UserRole;
                setRole(r);
                if (r === 'lead') setDepartments(['Frontend']);
                else if (r === 'admin') setDepartments(['Management']);
                else setDepartments(['Frontend']);
              }}
            >
              <option value="employee">Employee</option>
              <option value="lead">Team Lead</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {role === 'employee' && (
            <>
              <div className="form-group">
                <label className="form-label">
                  Departments
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {DEPARTMENTS.map((dept) => (
                    <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--bg-glass)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={departments.includes(dept)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDepartments([...departments, dept]);
                          } else {
                            // ensure at least one remains
                            if (departments.length > 1) {
                              setDepartments(departments.filter(d => d !== dept));
                            }
                          }
                        }}
                      />
                      {dept}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="start-date">
                    Internship Start Date
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    className="form-input"
                    value={internshipStartDate}
                    onChange={(e) => setInternshipStartDate(e.target.value)}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="end-date">
                    Internship End Date
                  </label>
                  <input
                    id="end-date"
                    type="date"
                    className="form-input"
                    value={internshipEndDate}
                    onChange={(e) => setInternshipEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              className="form-input"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm-password">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              className="form-input"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={emailLoading || googleLoading}
            style={{ width: '100%', marginTop: '8px' }}
          >
            {emailLoading ? (
              <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div style={{ margin: '24px 0', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
          <span style={{ padding: '0 12px', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-lg"
          onClick={handleGoogleSignIn}
          disabled={emailLoading || googleLoading}
          style={{ width: '100%', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}
        >
          {googleLoading ? (
            <span className="spinner spinner-sm" />
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="auth-footer" style={{ marginTop: '24px' }}>
          <p>
            Already have an account?{' '}
            <Link href="/login">Sign in here</Link>
          </p>
        </div>

        <div style={{ marginTop: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
          <p>
            Software Designed & Developed by{' '}
            <button 
              type="button" 
              onClick={handleAdminLogin} 
              title="Click to open Admin Login"
              style={{ color: '#2563eb', background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '14px', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer' }}
            >
              زافرين عفيفة
            </button>
          </p>
          <p>© 2026 Vision Printt Technologies. All Rights Reserved.</p>
        </div>
      </div>
    </div>
  );
}
