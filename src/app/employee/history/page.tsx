'use client';

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getUserSessions } from '@/lib/firestore';
import type { WorkSession } from '@/types';
import styles from '../dashboard/Dashboard.module.css';

export default function HistoryPage() {
  const { mimoUser } = useAuthStore();
  const { timeFormat } = useSettingsStore();
  const [allSessions, setAllSessions] = useState<WorkSession[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mimoUser?.uid) {
      getUserSessions(mimoUser.uid).then(sessions => {
        setAllSessions(sessions);
      });
    }
  }, [mimoUser]);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: timeFormat === '12h'
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 0) return '0h 0m';
    const totalM = Math.floor(ms / 60000);
    const h = Math.floor(totalM / 60);
    const m = totalM % 60;
    return `${h}h ${m}m`;
  };

  if (!mounted) return null;

  return (
    <>
      <div className={styles.topHeader}>
        <div className={styles.greeting}>
          <h1>Your History</h1>
          <p>Review your past sessions, daily hours, and paused duration.</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Past Sessions</div>
        {allSessions.length === 0 ? <p style={{ color: '#64748b' }}>No past sessions found.</p> : (
          <div className={styles.completedList}>
            {allSessions.map(session => (
              <div className={styles.completedItem} key={session.id} style={{ marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1.5rem' }}>
                <div className={styles.completedIcon}></div>
                <div className={styles.completedInfo}>
                  <div className={styles.completedTitle} style={{ fontSize: '1.1rem' }}>
                    {new Date(session.clockInTime).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                  <div className={styles.completedTime}>
                    {formatTime(session.clockInTime)} - {session.clockOutTime ? formatTime(session.clockOutTime) : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.75rem', color: '#334155' }}>
                    <strong>Tasks Completed:</strong>
                    <ul style={{ paddingLeft: '1.5rem', margin: '0.25rem 0' }}>
                      {session.tasks?.length > 0 ? (
                        session.tasks.map(t => <li key={t.id}>{t.title}</li>)
                      ) : (
                        <li>None</li>
                      )}
                    </ul>
                  </div>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: '#334155' }}>
                    <strong>Summary:</strong> {session.workSummary || 'No summary provided.'}
                  </div>
                  {session.mood && (
                    <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: '#334155' }}>
                      <strong>Mood:</strong> {session.mood}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={styles.completedDuration} style={{ fontSize: '1rem', padding: '0.5rem 1rem', display: 'inline-block' }}>
                    {formatDuration(session.totalDurationMs)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                    Paused: {formatDuration(session.breakDurationMs || 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
