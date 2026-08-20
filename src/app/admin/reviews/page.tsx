'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAllSessions, reviewSession, getAllUsers, getAllLeaveRequests, updateUser } from '@/lib/firestore';
import { ADMIN_ROLES, LeaveRequest } from '@/types';
import type { WorkSession, MimoUser } from '@/types';

import { fmtDur } from '@/lib/utils';
import { getTheme } from '@/lib/theme';

interface MonthlyStats {
  totalMs: number;
  sessions: number;
  completedTasks: number;
  leaves: number;
}

interface UserMonthlyData {
  current: MonthlyStats;
  previous: MonthlyStats;
}

type FilterStatus = 'All' | 'Pending Review' | 'Reviewed';
type FilterTime = 'All Time' | 'Today' | 'This Week' | 'This Month';

export default function ReviewsPage() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [userStats, setUserStats] = useState<Record<string, UserMonthlyData>>({});
  const [usersMap, setUsersMap] = useState<Record<string, MimoUser>>({});
  const [loading, setLoading] = useState(true);
  
  const mimoUser = useAuthStore((s) => s.mimoUser);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All');
  const [timeFilter, setTimeFilter] = useState<FilterTime>('All Time');
  const [employeeFilter, setEmployeeFilter] = useState<string>('All');

  // Drawer
  const [selectedSession, setSelectedSession] = useState<WorkSession | null>(null);
  
  // Review Form
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, usrs, lvs] = await Promise.all([getAllSessions(), getAllUsers(), getAllLeaveRequests()]);
      const adminUids = new Set(usrs.filter(u => ADMIN_ROLES.includes(u.role)).map(u => u.uid));
      
      const uMap: Record<string, MimoUser> = {};
      usrs.forEach(u => { uMap[u.uid] = u; });
      setUsersMap(uMap);
      
      const completed = s.filter((x) => x.status !== 'active' && !adminUids.has(x.userId) && !!uMap[x.userId]);
      completed.sort((a, b) => new Date(b.clockInTime).getTime() - new Date(a.clockInTime).getTime());

      
      const stats: Record<string, UserMonthlyData> = {};
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const previousMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const initStats = (): MonthlyStats => ({ totalMs: 0, sessions: 0, completedTasks: 0, leaves: 0 });

      completed.forEach(session => {
        const d = new Date(session.clockInTime);
        const m = d.getMonth();
        const y = d.getFullYear();
        const ms = session.totalDurationMs || 0;
        const tasksCount = session.tasks?.length || 0;
        
        if (!stats[session.userId]) {
          stats[session.userId] = { current: initStats(), previous: initStats() };
        }
        
        if (m === currentMonth && y === currentYear) {
          stats[session.userId].current.totalMs += ms;
          stats[session.userId].current.sessions += 1;
          stats[session.userId].current.completedTasks += tasksCount;
        } else if (m === previousMonth && y === previousMonthYear) {
          stats[session.userId].previous.totalMs += ms;
          stats[session.userId].previous.sessions += 1;
          stats[session.userId].previous.completedTasks += tasksCount;
        }
      });

      lvs.forEach(lv => {
        const d = new Date(lv.createdAt);
        const m = d.getMonth();
        const y = d.getFullYear();
        if (lv.status === 'approved') {
          if (!stats[lv.userId]) {
            stats[lv.userId] = { current: initStats(), previous: initStats() };
          }
          if (m === currentMonth && y === currentYear) {
            stats[lv.userId].current.leaves += lv.days;
          } else if (m === previousMonth && y === previousMonthYear) {
            stats[lv.userId].previous.leaves += lv.days;
          }
        }
      });
      
      setUserStats(stats);
      setSessions(completed);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      // Status Filter
      if (statusFilter === 'Reviewed' && !s.review) return false;
      if (statusFilter === 'Pending Review' && s.review) return false;
      
      // Employee Filter
      if (employeeFilter !== 'All' && s.userId !== employeeFilter) return false;

      // Time Filter
      if (timeFilter !== 'All Time') {
        const sessionDate = new Date(s.clockInTime);
        const now = new Date();
        if (timeFilter === 'Today') {
          if (sessionDate.toDateString() !== now.toDateString()) return false;
        } else if (timeFilter === 'This Week') {
          const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
          if (sessionDate < firstDay) return false;
        } else if (timeFilter === 'This Month') {
          if (sessionDate.getMonth() !== now.getMonth() || sessionDate.getFullYear() !== now.getFullYear()) return false;
        }
      }
      return true;
    });
  }, [sessions, statusFilter, timeFilter, employeeFilter]);

  const uniqueEmployees = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach(s => map.set(s.userId, s.userName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const submitReview = async () => {
    if (!selectedSession || !mimoUser) return;
    setSubmittingReview(true);
    try {
      await reviewSession(selectedSession.id, {
        reviewedBy: mimoUser.uid,
        reviewerName: mimoUser.displayName,
        action: 'approved',
        comment: feedback,
        rating: rating,
        reviewedAt: new Date().toISOString()
      });
      // Update local state
      setSessions(prev => prev.map(s => {
        if (s.id === selectedSession.id) {
          return {
            ...s,
            review: {
              reviewedBy: mimoUser.uid,
              reviewerName: mimoUser.displayName,
              action: 'approved',
              comment: feedback,
              rating: rating,
              reviewedAt: new Date().toISOString()
            }
          };
        }
        return s;
      }));
      setSelectedSession(null);
      setFeedback('');
      setRating(0);
    } catch (e) {
      console.error(e);
      alert('Failed to submit review');
    }
    setSubmittingReview(false);
  };

  const calcDiff = (curr: number, prev: number) => {
    const diff = curr - prev;
    if (diff > 0) return `+${diff}`;
    return `${diff}`;
  };

  const getProductivity = (stats: MonthlyStats) => {
    if (stats.sessions === 0) return 0;
    // Arbitrary metric: 75 base + tasks per session * 5
    return Math.min(100, Math.round((stats.completedTasks / stats.sessions) * 15 + 75));
  };

  const { currentMonthKey, previousMonthKey } = useMemo(() => {
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
    return { currentMonthKey: curKey, previousMonthKey: prevKey };
  }, []);

  const handlePaymentStatusChange = async (userId: string, monthKey: string, newStatus: 'paid' | 'unpaid') => {
    const user = usersMap[userId];
    if (!user) return;
    const updatedStatus = { ...(user.paymentStatus || {}), [monthKey]: newStatus };
    setUsersMap(prev => ({
      ...prev,
      [userId]: { ...prev[userId], paymentStatus: updatedStatus }
    }));
    try {
      await updateUser(userId, { paymentStatus: updatedStatus });
    } catch (e) {
      console.error('Failed to update payment status:', e);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '50vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ position: 'relative' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h1>Work Reviews</h1>
        <p>Review and provide feedback on completed work sessions</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', background: 'var(--bg-card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as FilterStatus)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          <option value="All">All Status</option>
          <option value="Pending Review">Pending Review</option>
          <option value="Reviewed">Reviewed</option>
        </select>
        <select value={timeFilter} onChange={e => setTimeFilter(e.target.value as FilterTime)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          <option value="All Time">All Time</option>
          <option value="Today">Today</option>
          <option value="This Week">This Week</option>
          <option value="This Month">This Month</option>
        </select>
        <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          <option value="All">All Employees</option>
          {uniqueEmployees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.name}</option>
          ))}
        </select>
      </div>

      {filteredSessions.length === 0 ? (
        <div className="empty-state glass-card-static">
          <div className="empty-icon"></div>
          <h3>No work found</h3>
          <p>No completed sessions match your filters.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredSessions.map((session) => {
            const initials = session.userName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
            const dept = session.userDepartments?.[0] || session.userDepartment || 'Unknown';
            const theme = getTheme(dept);
            const stats = userStats[session.userId];
            const isReviewed = !!session.review;
            const curStatus = usersMap[session.userId]?.paymentStatus?.[currentMonthKey] || 'unpaid';
            const prevStatus = usersMap[session.userId]?.paymentStatus?.[previousMonthKey] || 'unpaid';

            return (
              <div key={session.id} style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', overflow: 'hidden' }}>
                {/* Status Badge */}
                <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', alignItems: 'center', gap: '6px', background: isReviewed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: isReviewed ? '#10b981' : '#f59e0b', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isReviewed ? '#10b981' : '#f59e0b' }} />
                  {isReviewed ? 'Reviewed' : 'Pending Review'}
                </div>

                {/* Header */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div className="avatar avatar-lg" style={{ background: theme.accent, color: '#fff' }}>{initials}</div>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text-primary)' }}>{session.userName}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`badge badge-dept-${dept.toLowerCase().replace(/\s+/g, '-')}`}>{dept}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {new Date(session.clockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → {session.clockOutTime ? new Date(session.clockOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Grid Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Worked</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtDur(session.totalDurationMs)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pauses</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{session.breaks.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Tasks</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{session.tasks.length} Completed</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Mood</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{session.mood === 'frustrated' ? 'Frustrated' : session.mood === 'neutral' ? 'Neutral' : session.mood === 'good' ? 'Good' : session.mood === 'fire' ? 'Fire' : 'N/A'}</div>
                  </div>
                </div>

                {/* Rating (if reviewed) */}
                {session.review && session.review.rating && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontSize: '18px' }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i}>{i < session.review!.rating! ? '★' : '☆'}</span>
                    ))}
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '8px' }}>{session.review.rating}/5</span>
                  </div>
                )}

                {/* Monthly Payment Status Option */}
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                  <div style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>This Month</div>
                    <select
                      value={curStatus}
                      onChange={(e) => handlePaymentStatusChange(session.userId, currentMonthKey, e.target.value as 'paid' | 'unpaid')}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        outline: 'none',
                        backgroundColor: curStatus === 'paid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: curStatus === 'paid' ? '#10b981' : '#f59e0b',
                      }}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Last Month</div>
                    <select
                      value={prevStatus}
                      onChange={(e) => handlePaymentStatusChange(session.userId, previousMonthKey, e.target.value as 'paid' | 'unpaid')}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        outline: 'none',
                        backgroundColor: prevStatus === 'paid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: prevStatus === 'paid' ? '#10b981' : '#f59e0b',
                      }}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                </div>

                {/* Action */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button 
                    onClick={() => {
                      setSelectedSession(session);
                      if (session.review) {
                        setRating(session.review.rating || 0);
                        setFeedback(session.review.comment || '');
                      } else {
                        setRating(0);
                        setFeedback('');
                      }
                    }}
                    style={{ background: 'var(--mimo-primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{isReviewed ? 'View Details' : 'Review'}</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-out Drawer */}
      {selectedSession && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.5)' }} onClick={() => setSelectedSession(null)}>
          <div style={{ width: '450px', maxWidth: '100%', background: 'var(--bg-card)', height: '100%', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Session Details</h2>
              <button onClick={() => setSelectedSession(null)} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
              {/* Employee Info */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div className="avatar avatar-lg" style={{ background: getTheme(selectedSession.userDepartments?.[0] || selectedSession.userDepartment || 'Unknown').accent, color: '#fff' }}>
                  {selectedSession.userName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '18px' }}>{selectedSession.userName}</h3>
                  <span className={`badge badge-dept-${(selectedSession.userDepartments?.[0] || selectedSession.userDepartment || 'other').toLowerCase().replace(/\s+/g, '-')}`}>
                    {selectedSession.userDepartments?.[0] || selectedSession.userDepartment || 'Unknown'}
                  </span>
                </div>
              </div>

              {/* Monthly Stats Comparison */}
              {userStats[selectedSession.userId] && (
                <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Performance vs Last Month</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Hours</span>
                      <span style={{ fontWeight: 600 }}>{fmtDur(userStats[selectedSession.userId].current.totalMs)} <span style={{ color: userStats[selectedSession.userId].current.totalMs >= userStats[selectedSession.userId].previous.totalMs ? '#10b981' : '#f43f5e', fontSize: '12px', marginLeft: '4px' }}>({calcDiff(Math.round(userStats[selectedSession.userId].current.totalMs / 3600000), Math.round(userStats[selectedSession.userId].previous.totalMs / 3600000))}h)</span></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Tasks</span>
                      <span style={{ fontWeight: 600 }}>{userStats[selectedSession.userId].current.completedTasks} <span style={{ color: userStats[selectedSession.userId].current.completedTasks >= userStats[selectedSession.userId].previous.completedTasks ? '#10b981' : '#f43f5e', fontSize: '12px', marginLeft: '4px' }}>({calcDiff(userStats[selectedSession.userId].current.completedTasks, userStats[selectedSession.userId].previous.completedTasks)})</span></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Productivity</span>
                      <span style={{ fontWeight: 600 }}>{getProductivity(userStats[selectedSession.userId].current)}% <span style={{ color: getProductivity(userStats[selectedSession.userId].current) >= getProductivity(userStats[selectedSession.userId].previous) ? '#10b981' : '#f43f5e', fontSize: '12px', marginLeft: '4px' }}>({calcDiff(getProductivity(userStats[selectedSession.userId].current), getProductivity(userStats[selectedSession.userId].previous))}%)</span></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Session Timeline */}
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Session Summary</h4>
                <div style={{ padding: '16px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '14px', lineHeight: 1.6 }}>
                  {selectedSession.workSummary || 'No summary provided.'}
                </div>
              </div>

              {/* Tasks */}
              {selectedSession.tasks.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Tasks ({selectedSession.tasks.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedSession.tasks.map(t => (
                      <div key={t.id} style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.title}</div>
                        {t.description && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{t.description}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review Section */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px', marginTop: 'auto' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>{selectedSession.review ? 'Manager Review' : 'Submit Review'}</h4>
                
                {/* Rating Input */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Employee Rating</label>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '28px', color: '#f59e0b' }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <span 
                        key={star} 
                        style={{ cursor: selectedSession.review ? 'default' : 'pointer' }}
                        onClick={() => !selectedSession.review && setRating(star)}
                      >
                        {star <= rating ? '★' : '☆'}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Feedback Input */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Feedback</label>
                  {selectedSession.review ? (
                    <div style={{ padding: '16px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', lineHeight: 1.6 }}>
                      {selectedSession.review.comment || 'No feedback provided.'}
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px' }}>
                        Reviewed by {selectedSession.review.reviewerName || 'Manager'} on {new Date(selectedSession.review.reviewedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ) : (
                    <textarea 
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      placeholder="Great progress today. Need better documentation..."
                      style={{ width: '100%', height: '100px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical' }}
                    />
                  )}
                </div>

                {!selectedSession.review && (
                  <button 
                    disabled={submittingReview || rating === 0}
                    onClick={submitReview}
                    style={{ width: '100%', padding: '12px', background: 'var(--mimo-primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: (submittingReview || rating === 0) ? 'not-allowed' : 'pointer', opacity: (submittingReview || rating === 0) ? 0.7 : 1 }}
                  >
                    {submittingReview ? 'Submitting...' : 'Submit Review'}
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
