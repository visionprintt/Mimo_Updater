'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOutUser, isAdmin } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function PendingPage() {
  const router = useRouter();
  const { firebaseUser } = useAuthStore();

  // Real-time listener — auto-redirect when admin approves the account
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubscribe = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status === 'approved') {
          if (isAdmin(data.role)) {
            router.replace('/admin');
          } else {
            router.replace('/employee/dashboard');
          }
        } else if (data.status === 'rejected') {
          router.replace('/login');
        }
      }
    );

    return () => unsubscribe();
  }, [firebaseUser, router]);

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/login');
  };

  return (
    <div className="pending-container">
      <div className="pending-card animate-in">
        <div className="pending-icon"></div>
        <h2>Account Pending Approval</h2>
        <p style={{ marginTop: '12px' }}>
          Your account has been created successfully and is awaiting approval from an
          administrator (HR, Founder, or Co-founder).
        </p>
        <p style={{ marginTop: '12px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          This page will automatically redirect you the moment your account is approved.
          No need to refresh!
        </p>
        <button
          className="btn btn-ghost"
          onClick={handleSignOut}
          style={{ marginTop: '24px' }}
        >
          ← Back to Login
        </button>
      </div>
    </div>
  );
}
