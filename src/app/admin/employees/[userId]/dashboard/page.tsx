'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSettingsStore } from '@/store/settingsStore';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import styles from '@/app/employee/dashboard/Dashboard.module.css';
import { getUser, getUserSessions, getTasksByEmployee, addTask, createAuditLog } from '@/lib/firestore';
import type { WorkSession, MimoUser, MimoTask, TaskPriority } from '@/types';
import { SESSION_DURATION_MS } from '@/types';
import { useAuthStore } from '@/store/authStore';

export default function AdminEmployeeDashboardOverview() {
  const params = useParams();
  const userId = params.userId as string;

  const { timeFormat } = useSettingsStore();

  const { mimoUser: adminUser } = useAuthStore();

  const [employee, setEmployee] = useState<MimoUser | null>(null);
  const [allSessions, setAllSessions] = useState<WorkSession[]>([]);
  const [tasks, setTasks] = useState<MimoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Medium');

  const getDefaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const [newDueDate, setNewDueDate] = useState(getDefaultDate());

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeSession = allSessions.find(s => s.status === 'active');
  const isWorking = !!activeSession;
  const lastBreak = activeSession?.breaks?.[activeSession.breaks.length - 1];
  const isOnBreak = !!lastBreak && !lastBreak.endedAt;

  const [currentElapsedMs, setCurrentElapsedMs] = useState(0);
  const [timeRange, setTimeRange] = useState<'thisWeek' | 'lastWeek' | 'twoWeeks'>('thisWeek');

  const loadEmployeeData = () => {
    if (userId) {
      Promise.all([
        getUser(userId),
        getUserSessions(userId),
        getTasksByEmployee(userId)
      ]).then(([userDoc, sessions, empTasks]) => {
        setEmployee(userDoc);
        setAllSessions(sessions);
        setTasks(empTasks || []);
        setLoading(false);
      }).catch(err => {
        console.error('Error fetching employee data:', err);
        setLoading(false);
      });
    }
  };

  useEffect(() => {
    loadEmployeeData();
  }, [userId]);

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser || !newTitle.trim() || !newDueDate || !employee) return;

    try {
      const dueDateIso = new Date(newDueDate).toISOString();
      const taskId = await addTask({
        title: newTitle.trim(),
        description: newDesc.trim(),
        assignedTo: userId,
        assignedBy: adminUser.uid,
        priority: newPriority,
        status: 'pending',
        startDate: new Date().toISOString(),
        dueDate: dueDateIso,
      });

      await createAuditLog({
        actorId: adminUser.uid,
        actorName: adminUser.displayName,
        action: 'TASK_ASSIGNED',
        targetId: taskId,
        details: `Assigned task "${newTitle}" to ${employee.displayName}`,
        createdAt: new Date().toISOString()
      });

      setShowTaskModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewPriority('Medium');
      setNewDueDate(getDefaultDate());
      loadEmployeeData();
    } catch (e: any) {
      console.error('Failed to assign task', e);
      alert('Failed to assign task: ' + (e.message || 'Unknown error'));
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeSession && isWorking && !isOnBreak) {
      interval = setInterval(() => {
        const now = Date.now();
        const start = new Date(activeSession.clockInTime).getTime();
        const breakTime = activeSession.breakDurationMs || 0;
        setCurrentElapsedMs(now - start - breakTime);
      }, 1000);
    } else if (activeSession) {
      let endCalcMs = Date.now();
      if (isOnBreak && activeSession.breaks.length > 0) {
        endCalcMs = new Date(activeSession.breaks[activeSession.breaks.length - 1].startedAt).getTime();
      }
      const start = new Date(activeSession.clockInTime).getTime();
      const breakTime = activeSession.breakDurationMs || 0;
      setCurrentElapsedMs(endCalcMs - start - breakTime);
    } else {
      setCurrentElapsedMs(0);
    }
    return () => clearInterval(interval);
  }, [activeSession, isWorking, isOnBreak]);

  const formatLiveTimer = (ms: number) => {
    if (ms < 0) return '00:00:00';
    const totalS = Math.floor(ms / 1000);
    const h = Math.floor(totalS / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalS % 3600) / 60).toString().padStart(2, '0');
    const s = (totalS % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 0) return '0h 0m';
    const totalM = Math.floor(ms / 60000);
    const h = Math.floor(totalM / 60);
    const m = totalM % 60;
    return `${h}h ${m}m`;
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: timeFormat === '12h'
    });
  };

  const totalWorkedMs = allSessions.reduce((acc, s) => acc + (s.totalDurationMs || 0), 0);
  const totalTasksCompleted = allSessions.reduce((acc, s) => acc + (s.tasks?.length || 0), 0);

  const todayWorkedMs = (() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const completedTodayMs = allSessions.filter(s => {
      const sDate = new Date(s.clockInTime);
      sDate.setHours(0,0,0,0);
      if (activeSession && s.id === activeSession.id) return false;
      return sDate.getTime() === today.getTime();
    }).reduce((acc, s) => acc + (s.totalDurationMs || 0), 0);
    return completedTodayMs + currentElapsedMs;
  })();

  const barData = (() => {
    const data = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const startOffset = timeRange === 'thisWeek' ? 6 : timeRange === 'lastWeek' ? 13 : 13;
    const endOffset = timeRange === 'lastWeek' ? 7 : 0;

    for (let i = startOffset; i >= endOffset; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: timeRange === 'twoWeeks' ? 'numeric' : undefined, day: timeRange === 'twoWeeks' ? 'numeric' : undefined });
      
      const daySessions = allSessions.filter(s => {
        const sDate = new Date(s.clockInTime);
        sDate.setHours(0,0,0,0);
        return sDate.getTime() === d.getTime();
      });
      
      const totalMs = i === 0 ? todayWorkedMs : daySessions.reduce((acc, s) => acc + (s.totalDurationMs || 0), 0);
      const hours = totalMs / (1000 * 60 * 60);
      
      data.push({
        day: dayStr,
        value: Number(hours.toFixed(2)),
        active: i === 0,
      });
    }
    return data;
  })();

  const areaData = (() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const todaySessions = allSessions.filter(s => {
      const sDate = new Date(s.clockInTime);
      sDate.setHours(0,0,0,0);
      return sDate.getTime() === today.getTime();
    });

    const sessionsToBucket = [...todaySessions];
    if (activeSession) {
      const actDate = new Date(activeSession.clockInTime);
      actDate.setHours(0,0,0,0);
      if (actDate.getTime() === today.getTime() && !sessionsToBucket.some(s => s.id === activeSession.id)) {
        sessionsToBucket.push(activeSession);
      }
    }

    const buckets: Record<string, number> = {
      '12 AM': 0, '4 AM': 0, '8 AM': 0, '12 PM': 0, '4 PM': 0, '8 PM': 0, '11 PM': 0
    };

    sessionsToBucket.forEach(s => {
      const hour = new Date(s.clockInTime).getHours();
      const durMs = (activeSession && s.id === activeSession.id) ? Math.max(s.totalDurationMs || 0, currentElapsedMs) : (s.totalDurationMs || 0);
      const durationHours = durMs / (1000 * 60 * 60);
      if (hour >= 0 && hour < 4) buckets['12 AM'] += durationHours;
      else if (hour >= 4 && hour < 8) buckets['4 AM'] += durationHours;
      else if (hour >= 8 && hour < 12) buckets['8 AM'] += durationHours;
      else if (hour >= 12 && hour < 16) buckets['12 PM'] += durationHours;
      else if (hour >= 16 && hour < 20) buckets['4 PM'] += durationHours;
      else if (hour >= 20 && hour < 24) buckets['8 PM'] += durationHours;
    });

    return [
      { time: '12 AM', value: Number(buckets['12 AM'].toFixed(2)) },
      { time: '4 AM', value: Number(buckets['4 AM'].toFixed(2)) },
      { time: '8 AM', value: Number(buckets['8 AM'].toFixed(2)) },
      { time: '12 PM', value: Number(buckets['12 PM'].toFixed(2)) },
      { time: '4 PM', value: Number(buckets['4 PM'].toFixed(2)) },
      { time: '8 PM', value: Number(buckets['8 PM'].toFixed(2)) },
      { time: '11 PM', value: Number(buckets['11 PM'].toFixed(2)) },
    ];
  })();

  const productivityScore = Math.min(100, Math.round((totalTasksCompleted / Math.max(1, allSessions.length)) * 15 + 75));
  const efficiencyScore = Math.min(100, Math.round(70 + (totalWorkedMs / (1000 * 60 * 60 * 40)) * 30));

  if (!mounted) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Employee Dashboard...</div>;
  if (loading || !employee) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Employee Dashboard...</div>;

  return (
    <>
      <div className={styles.topHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div className={styles.greeting}>
          <h1 style={{ display: 'flex', alignItems: 'center' }}>
            <Link href="/admin/employees" className="btn btn-sm btn-ghost" style={{ padding: '4px 8px', marginRight: '16px' }}>
              ← Back
            </Link> 
            {employee.displayName}'s Dashboard
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span style={{ backgroundColor: 'rgba(214, 155, 105, 0.15)', color: 'var(--mimo-primary)', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
              Department: {employee.department || employee.departments?.join(', ') || 'Unassigned'}
            </span>
            <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, textTransform: 'capitalize' }}>
              Role: {employee.position || employee.role || 'Employee'}
            </span>
          </div>
        </div>
        <button 
          className={styles.btnPrimary} 
          onClick={() => setShowTaskModal(true)}
          style={{ padding: '10px 20px', fontSize: '14px', cursor: 'pointer', border: 'none', borderRadius: '8px' }}
        >
          + Assign New Task
        </button>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>Total Work Time</div>
            <div className={styles.statValue}>{formatDuration(totalWorkedMs)}</div>
            <div className={`${styles.statTrend} ${styles.up}`}>↑ Updated recently</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>Active Timer (3h Limit)</div>
            <div className={styles.statValue}>{activeSession ? formatLiveTimer(Math.max(0, SESSION_DURATION_MS - currentElapsedMs)) : 'Offline'}</div>
            <div className={`${styles.statTrend} ${styles.neutral}`}>
              {activeSession 
                ? (isOnBreak ? `Paused | Started at ${formatTime(activeSession.clockInTime)}` : `Live | Started at ${formatTime(activeSession.clockInTime)}`)
                : 'Not started'}
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>Tasks Completed</div>
            <div className={styles.statValue}>{totalTasksCompleted}</div>
            <div className={`${styles.statTrend} ${styles.up}`}>Across {allSessions.length} sessions</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>Productivity Score</div>
            <div className={styles.statValue}>{productivityScore}%</div>
            <div className={`${styles.statTrend} ${styles.up}`}>{productivityScore >= 90 ? 'Excellent' : 'Good'}</div>
          </div>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        {/* Weekly Overview */}
        <div style={{ gridColumn: 'span 2' }}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Weekly Overview
              <select 
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.8125rem', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', outline: 'none' }}
              >
                <option value="thisWeek">This Week (Last 7 Days)</option>
                <option value="lastWeek">Previous 7 Days</option>
                <option value="twoWeeks">Last 14 Days</option>
              </select>
            </div>
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.active ? 'var(--mimo-primary)' : 'var(--border-color)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Today's Summary</div>
            <div className={styles.summaryStats}>
              <div className={styles.summaryStat}>
                <div className={styles.summaryStatLabel}>Work Time</div>
                <div className={styles.summaryStatValue}>{formatDuration(todayWorkedMs)}</div>
              </div>
              <div className={styles.summaryStat}>
                <div className={styles.summaryStatLabel}>Efficiency</div>
                <div className={styles.summaryStatValue}>{efficiencyScore}%</div>
              </div>
            </div>
            <div className={styles.chartContainer} style={{ height: '120px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={areaData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="value" stroke="var(--mimo-primary)" fill="rgba(214, 155, 105, 0.15)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: '24px', marginBottom: '32px' }}>
        <div className={styles.cardTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Assigned Tasks ({tasks.length})</span>
          <button 
            className={styles.btnPrimary} 
            style={{ padding: '6px 14px', fontSize: '12px', cursor: 'pointer', border: 'none', borderRadius: '6px' }} 
            onClick={() => setShowTaskModal(true)}
          >
            + Assign Task
          </button>
        </div>
        {tasks.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', padding: '1rem 0' }}>No tasks assigned to this employee yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {tasks.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>{t.title}</span>
                    <span style={{ 
                      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                      backgroundColor: t.priority === 'High' ? 'rgba(239, 68, 68, 0.15)' : t.priority === 'Medium' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: t.priority === 'High' ? '#ef4444' : t.priority === 'Medium' ? '#f59e0b' : '#3b82f6'
                    }}>
                      {t.priority}
                    </span>
                    <span style={{ 
                      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                      backgroundColor: t.status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : t.status === 'in_progress' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                      color: t.status === 'completed' ? '#10b981' : t.status === 'in_progress' ? '#3b82f6' : 'var(--text-secondary)'
                    }}>
                      {t.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  {t.description && <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>{t.description}</p>}
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Due: {new Date(t.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showTaskModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '500px', width: '90%', background: 'var(--bg-primary)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Assign Task to {employee.displayName}</h2>
              <button onClick={() => setShowTaskModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '20px', color: 'var(--text-secondary)', cursor: 'pointer' }}>×</button>
            </div>
            <form onSubmit={handleAssignTask} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Task Title *</label>
                <input 
                  type="text" 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }}
                  placeholder="What needs to be done?" 
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Description (Optional)</label>
                <textarea 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px', resize: 'vertical' }}
                  placeholder="Provide any extra details or instructions..." 
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Priority</label>
                <select 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }}
                  value={newPriority} 
                  onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Due Date & Time *</label>
                <input 
                  type="datetime-local" 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }}
                  value={newDueDate} 
                  onChange={(e) => setNewDueDate(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowTaskModal(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Assign Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
