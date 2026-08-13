'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useSessionStore } from '@/store/sessionStore';
import { signOutUser } from '@/lib/auth';
import AuthGuard from '@/components/AuthGuard';
import AuthProvider from '@/components/AuthProvider';
import styles from './Dashboard.module.css';

import { useSettingsStore } from '@/store/settingsStore';

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/lead/dashboard' },
  { name: 'My Team', path: '/lead/team' },
  { name: 'Attendance', path: '/lead/attendance' },
  { name: 'Tasks', path: '/lead/tasks' },
  { name: 'Reports', path: '/lead/reports' },
  { name: 'Profile', path: '/lead/profile' },
];

export default function LeadDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { mimoUser, loading } = useAuthStore();
  const { loadActiveSession } = useSessionStore();
  const { theme } = useSettingsStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mimoUser?.uid) {
      loadActiveSession(mimoUser.uid);
    }
  }, [mimoUser, loadActiveSession]);

  useEffect(() => {
    if (mounted && !loading && !mimoUser) {
      router.push('/login');
    }
  }, [mounted, loading, mimoUser, router]);

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/login');
  };

  if (!mounted || loading || !mimoUser) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: theme === 'dark' ? '#0f172a' : '#f8fafc' }}>
        <p style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <AuthProvider>
      <AuthGuard requiredPermission="VIEW_TEAM_DASHBOARD">
        <div className={`${styles.pageContainer} ${theme === 'dark' ? styles.darkTheme : ''}`}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.logoContainer}>
          <span className={styles.logoHighlight}>MIMO</span> LEAD DASHBOARD
        </div>

        <div className={styles.navMenu}>
          {NAV_ITEMS.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={`${styles.navItem} ${pathname === item.path ? styles.active : ''}`}>
              {item.name}
            </Link>
          ))}
        </div>

        <div className={styles.userProfile}>
          <div className={styles.avatar}>
            {mimoUser?.avatarUrl ? (
              <img src={mimoUser.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              mimoUser?.displayName?.charAt(0) || 'M'
            )}
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{mimoUser?.displayName || 'Loading...'}</div>
            <div className={styles.userRole}>{mimoUser?.departments?.[0] || 'Employee'}</div>
            <div className={styles.onlineStatus}>
              <div className={styles.statusDot}></div> Online
            </div>
          </div>
        </div>
        <div className={styles.signOutBtn} onClick={handleSignOut}>
          Sign Out
        </div>
      </div>

      {/* Main Content Area */}
      <div className={styles.mainContent}>
        {children}
      </div>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}
