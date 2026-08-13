'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, updateDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getGlobalStats, getDepartmentStats, getAllUsers } from '@/lib/firestore';
import type { WorkSession, MimoUser, Department } from '@/types';
import { DEPARTMENTS, ADMIN_ROLES } from '@/types';
import { useAuthStore } from '@/store/authStore';

import { fmtDur } from '@/lib/utils';
import { getTheme } from '@/lib/theme';

const getDeptColor = (dept: string) => {
  return getTheme(dept).accent;
};

const DEPT_BG: Record<string, string> = {
  'Marketing': 'rgba(181,131,141,0.07)', // Rose
  'Frontend': 'rgba(118,128,99,0.07)',   // Olive
  'Backend': 'rgba(201,166,107,0.07)',   // Gold
  'Production': 'rgba(181,131,141,0.07)', // Rose
  'Hardware Team': 'rgba(118,128,99,0.07)', // Olive
  'Finance': 'rgba(201,166,107,0.07)',    // Gold
  'Design': 'rgba(181,131,141,0.07)',     // Rose
};

export default function AnalyticsPage() {
  const { mimoUser } = useAuthStore();
  const searchParams = useSearchParams();
  const searchQuery = (searchParams.get('q') || '').toLowerCase();

  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [users, setUsers] = useState<MimoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'all'>('week');
  const [activeView, setActiveView] = useState<'overview' | 'by-department'>('overview');
  const [selectedDept, setSelectedDept] = useState<Department | 'all'>('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [globalStats, setGlobalStats] = useState({ totalSessions: 0, totalDurationMs: 0 });
  const [deptStatsTotal, setDeptStatsTotal] = useState<Record<string, { totalSessions: number; totalDurationMs: number }>>({});

  // Carousel & Month states
  const [currentDeptIndex, setCurrentDeptIndex] = useState(0);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlySessionsCache, setMonthlySessionsCache] = useState<Record<string, WorkSession[]>>({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  const loadData = async () => {
    setLoading(true);
    
    const [usrs, snap] = await Promise.all([
      getAllUsers(), 
      getDocs(query(collection(db, 'sessions')))
    ]);
    const adminUids = new Set(usrs.filter(u => ADMIN_ROLES.includes(u.role)).map(u => u.uid));
    const allInternSessions = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkSession)).filter(s => !adminUids.has(s.userId));
    
    setUsers(usrs.filter((usr) => usr.status === 'approved'));

    let totalDurationMs = 0;
    const deptMap: Record<string, { totalSessions: number; totalDurationMs: number }> = {};
    DEPARTMENTS.forEach(d => deptMap[d] = { totalSessions: 0, totalDurationMs: 0 });

    const weekAgoTime = new Date();
    weekAgoTime.setDate(weekAgoTime.getDate() - 7);
    const weekAgoMs = weekAgoTime.getTime();
    
    const recentSessions: WorkSession[] = [];

    allInternSessions.forEach(ses => {
      totalDurationMs += (ses.totalDurationMs || 0);
      const d = ses.userDepartment || '';
      if (deptMap[d]) {
        deptMap[d].totalSessions += 1;
        deptMap[d].totalDurationMs += (ses.totalDurationMs || 0);
      }
      if (new Date(ses.clockInTime).getTime() >= weekAgoMs) {
        recentSessions.push(ses);
      }
    });

    setGlobalStats({ totalSessions: allInternSessions.length, totalDurationMs });
    setDeptStatsTotal(deptMap);
    setSessions(allInternSessions.filter((ses) => ses.status !== 'active'));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeView !== 'by-department') return;
    if (monthlySessionsCache[selectedMonth]) return;

    const fetchMonth = async () => {
      setLoadingMonth(true);
      try {
        const [year, month] = selectedMonth.split('-');
        const startDate = new Date(Number(year), Number(month) - 1, 1);
        const endDate = new Date(Number(year), Number(month), 1); // 1st of next month

        const q = query(
          collection(db, 'sessions'),
          where('clockInTime', '>=', startDate.toISOString()),
          where('clockInTime', '<', endDate.toISOString())
        );
        const snap = await getDocs(q);
        const monthSessions = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkSession));
        
        const adminUids = new Set(users.filter(u => ADMIN_ROLES.includes(u.role)).map(u => u.uid));
        
        setMonthlySessionsCache(prev => ({
          ...prev,
          [selectedMonth]: monthSessions.filter(s => s.status !== 'active' && !adminUids.has(s.userId))
        }));
      } catch (err) {
        console.error("Error fetching month:", err);
      } finally {
        setLoadingMonth(false);
      }
    };

    fetchMonth();
  }, [activeView, selectedMonth, monthlySessionsCache]);



  const filteredSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((s) => {
      const sessionDate = new Date(s.clockInTime);
      if (dateRange === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return sessionDate >= weekAgo;
      }
      if (dateRange === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return sessionDate >= monthAgo;
      }
      return true;
    });
  }, [sessions, dateRange]);

  // ─── Global Stats ─────────────────────────────────────────────────
  const totalSessions = globalStats.totalSessions;
  const totalHoursMs = globalStats.totalDurationMs;
  const avgSessionMs = totalSessions > 0 ? totalHoursMs / totalSessions : 0;

  // ─── Per-department analytics ──────────────────────────────────────
  const deptStats = useMemo(() => {
    const map: Record<string, {
      sessions: WorkSession[];
      totalMs: number;
      avgMs: number;
      starred: number;
      flagged: number;
      approved: number;
      unreviewed: number;
      memberCount: number;
    }> = {};

    for (const dept of DEPARTMENTS) {
      const deptSessions = filteredSessions.filter((s) => s.userDepartments?.includes(dept) || s.userDepartment === dept);
      const members = new Set(deptSessions.map((s) => s.userId));
      const totalMs = deptStatsTotal[dept]?.totalDurationMs || 0;
      map[dept] = {
        sessions: deptSessions,
        totalMs,
        avgMs: deptStatsTotal[dept]?.totalSessions > 0 ? totalMs / deptStatsTotal[dept].totalSessions : 0,
        starred: 0,
        flagged: 0,
        approved: deptSessions.filter((s) => s.review?.action === 'approved').length,
        unreviewed: deptSessions.filter((s) => !s.review).length,
        memberCount: members.size,
      };
    }
    return map;
  }, [filteredSessions]);


  // ─── Leaderboard (global or per dept) ─────────────────────────────
  const sessionSource = selectedDept === 'all' ? filteredSessions : filteredSessions.filter((s) => s.userDepartments?.includes(selectedDept) || s.userDepartment === selectedDept);
  const hoursByUser = useMemo(() => {
    const map: Record<string, { name: string; dept: string; hours: number; sessions: number; stars: number; flags: number }> = {};
    for (const s of sessionSource) {
      if (!map[s.userId]) {
        const uDepts = s.userDepartments || (s.userDepartment ? [s.userDepartment] : ['']);
        map[s.userId] = { name: s.userName, dept: uDepts.join(', '), hours: 0, sessions: 0, stars: 0, flags: 0 };
      }
      map[s.userId].hours += s.totalDurationMs;
      map[s.userId].sessions += 1;
      if (s.review?.action === 'approved') map[s.userId].stars += 0; // Legacy
      if (s.review?.action === 'approved') map[s.userId].flags += 0; // Legacy
    }
    let results = Object.entries(map).sort((a, b) => b[1].hours - a[1].hours);
    if (searchQuery) {
      results = results.filter(([_, data]) => 
        data.name.toLowerCase().includes(searchQuery) ||
        data.dept.toLowerCase().includes(searchQuery)
      );
    }
    return results;
  }, [sessionSource, searchQuery]);

  // ─── Task categories ──────────────────────────────────────────────
  const taskCategories = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of filteredSessions) {
      for (const task of s.tasks) {
        map[task.category] = (map[task.category] || 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredSessions]);
  const totalTasks = taskCategories.reduce((acc, [, count]) => acc + count, 0);

  // ─── Daily activity ───────────────────────────────────────────────
  const dailyActivity = useMemo(() => {
    const days = dateRange === 'week' ? 7 : dateRange === 'month' ? 30 : 90;
    const result: { date: string; hours: number; count: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const daySessions = filteredSessions.filter((s) => s.clockInTime.startsWith(dateStr));
      result.push({
        date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        hours: daySessions.reduce((acc, s) => acc + s.totalDurationMs, 0),
        count: daySessions.length,
      });
    }
    return result;
  }, [filteredSessions, dateRange]);
  const maxDailyHours = Math.max(...dailyActivity.map((d) => d.hours), 1);



  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '50vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Analytics</h1>
          <p>Team performance and productivity insights</p>
        </div>

      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {(['week', 'month', 'all'] as const).map((range) => (
            <button
              key={range}
              className="btn btn-sm"
              style={{
                background: dateRange === range ? 'var(--mimo-primary)' : 'var(--bg-input)',
                color: dateRange === range ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: dateRange === range ? 600 : 500,
                transition: 'all 0.2s ease',
                boxShadow: dateRange === range ? '0 4px 12px rgba(108, 92, 231, 0.3)' : 'none'
              }}
              onClick={() => setDateRange(range)}
            >
              {range === 'week' ? 'Last 7 Days' : range === 'month' ? 'Last 30 Days' : 'All Time'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['overview', 'by-department'] as const).map((view) => (
            <button
              key={view}
              className="btn btn-sm"
              style={{
                background: activeView === view ? 'var(--mimo-primary)' : 'var(--bg-input)',
                color: activeView === view ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeView === view ? 700 : 500,
                border: 'none',
                boxShadow: activeView === view ? '0 4px 12px rgba(108, 92, 231, 0.3)' : 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
              onClick={() => setActiveView(view)}
            >
              {view === 'overview' ? 'Overview' : 'By Department'}
            </button>
          ))}
        </div>
      </div>


      {/* ── OVERVIEW VIEW ── */}
      {activeView === 'overview' && (
        <>
          {/* Top Stat Cards with glowing neumorphic border look */}
          <div className="admin-stats-row">
            <div className="admin-stat-card">
              <div className="admin-stat-info">
                <div className="admin-stat-label">Total Team Work Time</div>
                <div className="admin-stat-value">{fmtDur(totalHoursMs)}</div>
                <div className="admin-stat-trend">↑ Across {totalSessions} sessions</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-info">
                <div className="admin-stat-label">Active Team Members</div>
                <div className="admin-stat-value">{users.length}</div>
                <div className="admin-stat-trend">Approved & Active</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-info">
                <div className="admin-stat-label">Avg Session Duration</div>
                <div className="admin-stat-value">{fmtDur(avgSessionMs)}</div>
                <div className="admin-stat-trend neutral">Per session average</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-info">
                <div className="admin-stat-label">Total Tasks Logged</div>
                <div className="admin-stat-value">{totalTasks}</div>
                <div className="admin-stat-trend">Across team & departments</div>
              </div>
            </div>
          </div>


          {/* Daily Activity Chart */}
          <div className="glass-card-static" style={{ marginBottom: '32px' }}>
            <h4 style={{ marginBottom: '20px', display:'flex', alignItems:'center', gap:'8px' }}>
              Daily Activity
            </h4>
            <div style={{ 
              display: 'flex', alignItems: 'flex-end', gap: '8px', height: '200px', 
              paddingBottom: '32px', paddingTop: '16px', position: 'relative',
              borderBottom: '1px solid var(--border-color)'
            }}>
              {dailyActivity.map((day, idx) => {
                const heightPct = (day.hours / maxDailyHours) * 100;
                return (
                  <div key={idx} className="group" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }} title={`${day.date}: ${fmtDur(day.hours)} (${day.count} sessions)`}>
                    <div style={{ 
                      width: '100%', maxWidth: '32px', height: `${Math.max(heightPct, 2)}%`, 
                      background: day.hours > 0 ? 'linear-gradient(180deg, var(--mimo-primary), var(--mimo-primary-light))' : 'var(--bg-input)', 
                      borderRadius: '6px 6px 0 0', transition: 'all 0.3s ease', minHeight: '2px',
                      boxShadow: day.hours > 0 ? '0 -4px 12px rgba(108,92,231,0.2)' : 'none',
                      opacity: 0.9,
                      cursor: 'pointer'
                    }} 
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scaleY(1.02)'; e.currentTarget.style.transformOrigin = 'bottom'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scaleY(1)'; }}
                    />
                    {(idx % Math.ceil(dailyActivity.length / 10) === 0 || dailyActivity.length <= 10) && (
                      <span style={{ 
                        fontSize: '11px', color: 'var(--text-secondary)', position: 'absolute', 
                        bottom: '-28px', whiteSpace: 'nowrap', left: '50%', transform: 'translateX(-50%)', 
                        fontWeight: '600', letterSpacing: '0.05em' 
                      }}>
                        {day.date}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Global Leaderboard */}
          <div className="glass-card-static">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4>Leaderboard</h4>
              <div style={{ position: 'relative', zIndex: 50 }}>
                <button
                  className="form-select"
                  style={{ width: '180px', padding: '6px 32px 6px 12px', fontSize: 'var(--font-size-sm)', textAlign: 'left', background: 'var(--bg-input)' }}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  {selectedDept === 'all' ? 'All Departments' : selectedDept}
                </button>
                
                {dropdownOpen && (
                  <div style={{ 
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: '180px', 
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)', 
                    borderRadius: '8px', overflow: 'hidden', zIndex: 10,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                  }}>
                    <div 
                      onClick={() => { setSelectedDept('all'); setDropdownOpen(false); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--font-size-sm)', background: selectedDept === 'all' ? 'var(--bg-input-focus)' : 'transparent', color: selectedDept === 'all' ? 'var(--mimo-primary)' : 'var(--text-primary)' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-input-focus)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = selectedDept === 'all' ? 'var(--bg-input-focus)' : 'transparent'}
                    >
                      All Departments
                    </div>
                    {DEPARTMENTS.map((d) => (
                      <div 
                        key={d}
                        onClick={() => { setSelectedDept(d); setDropdownOpen(false); }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--font-size-sm)', background: selectedDept === d ? 'var(--bg-input-focus)' : 'transparent', color: selectedDept === d ? 'var(--mimo-primary)' : 'var(--text-primary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-input-focus)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = selectedDept === d ? 'var(--bg-input-focus)' : 'transparent'}
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {hoursByUser.length === 0 ? (
              <div className="empty-state"><p>No data yet</p></div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Intern</th>
                      <th>Department</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoursByUser.map(([userId, data], idx) => (
                      <tr key={userId}>
                        <td style={{ fontWeight: 700, color: idx < 3 ? 'var(--status-starred)' : 'var(--text-muted)' }}>
                          {idx + 1}
                        </td>
                        <td style={{ fontWeight: 500 }}>{data.name}</td>
                        <td><span className={`badge badge-dept-${data.dept.toLowerCase().replace(/\s+/g, '-')}`}>{data.dept}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--mimo-accent)' }}>{fmtDur(data.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── BY DEPARTMENT VIEW ── */}
      {activeView === 'by-department' && (() => {
        const [year, month] = selectedMonth.split('-');
        const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
        const dateHeaders: { dayNumber: number; label: string }[] = [];
        for (let i = 1; i <= daysInMonth; i++) {
          const d = new Date(Number(year), Number(month) - 1, i);
          dateHeaders.push({ 
            dayNumber: i, 
            label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) 
          });
        }

        const dept = DEPARTMENTS[currentDeptIndex];
        const monthSessions = monthlySessionsCache[selectedMonth] || [];
        const deptSessions = monthSessions.filter(s => s.userDepartment === dept);
        const deptUsers = users.filter((u) => (u.department as any) === dept);
        
        // Compute stats for current department in this month
        const totalMs = deptSessions.reduce((acc, s) => acc + s.totalDurationMs, 0);
        const starred = 0;
        const flagged = 0;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Carousel Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                className="btn btn-ghost" 
                onClick={() => setCurrentDeptIndex(prev => prev === 0 ? DEPARTMENTS.length - 1 : prev - 1)}
              >
                ◀ Previous
              </button>
              
              <input 
                type="month" 
                className="form-input" 
                style={{ width: '200px', textAlign: 'center', fontWeight: 'bold' }}
                value={selectedMonth} 
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setCurrentWeekIndex(0);
                }} 
              />
              
              <button 
                className="btn btn-ghost" 
                onClick={() => setCurrentDeptIndex(prev => prev === DEPARTMENTS.length - 1 ? 0 : prev + 1)}
              >
                Next &gt;
              </button>
            </div>

            {loadingMonth ? (
              <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="spinner" style={{ margin: '0 auto 16px' }} />
                Loading {dept} data for {selectedMonth}...
              </div>
            ) : (
              <div className="glass-card-static" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Department Header */}
                <div style={{
                  background: DEPT_BG[dept],
                  borderBottom: `3px solid ${getDeptColor(dept)}`,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: getDeptColor(dept) }} />
                    <h4 style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>{dept}</h4>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{deptUsers.length}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Members</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{fmtDur(totalMs)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Hours</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--status-starred)' }}>{starred}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Stars</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--status-flagged)' }}>{flagged}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Flags</div>
                    </div>
                  </div>
                </div>

                {/* Attendance Matrix */}
                {deptUsers.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    No interns found in {dept}
                  </div>
                ) : (() => {
                  const weeks = [];
                  for (let i = 0; i < dateHeaders.length; i += 7) {
                    weeks.push(dateHeaders.slice(i, i + 7));
                  }
                  const currentWeekDates = weeks[currentWeekIndex] || [];
                  const weekStartLabel = currentWeekDates[0]?.label;
                  const weekEndLabel = currentWeekDates[currentWeekDates.length - 1]?.label;

                  return (
                    <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
                      {/* Week Paginator */}
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                        <button 
                          className="btn btn-sm btn-ghost" 
                          disabled={currentWeekIndex === 0} 
                          onClick={() => setCurrentWeekIndex(p => Math.max(0, p - 1))}
                        >
                          ◀
                        </button>
                        <div style={{ fontWeight: 600, minWidth: '180px', textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
                          {weekStartLabel} - {weekEndLabel}, {year}
                        </div>
                        <button 
                          className="btn btn-sm btn-ghost" 
                          disabled={currentWeekIndex === weeks.length - 1} 
                          onClick={() => setCurrentWeekIndex(p => Math.min(weeks.length - 1, p + 1))}
                        >
                          &gt;
                        </button>
                      </div>

                      <div className="table-container" style={{ overflowX: 'auto', maxHeight: '600px' }}>
                        <table className="data-table" style={{ minWidth: '800px' }}>
                          <thead>
                            <tr>
                              <th style={{ minWidth: '180px', position: 'sticky', left: 0, top: 0, background: 'var(--bg-card)', zIndex: 3 }}>Intern</th>
                              {currentWeekDates.map((dh) => (
                                <th key={dh.dayNumber} style={{ textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>
                                  {dh.label}
                                </th>
                              ))}
                              <th style={{ textAlign: 'center', minWidth: '100px', position: 'sticky', right: 0, top: 0, background: 'var(--bg-card)', zIndex: 3 }}>Monthly Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deptUsers.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((user) => {
                              const userSessions = deptSessions.filter((s) => s.userId === user.uid);
                              const userTotalMs = userSessions.reduce((acc, s) => acc + s.totalDurationMs, 0);

                              return (
                                <tr key={user.uid}>
                                  <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>{user.displayName}</td>
                                  {currentWeekDates.map((dh) => {
                                    const daySessions = userSessions.filter((s) => new Date(s.clockInTime).getDate() === dh.dayNumber);
                                    const dayMs = daySessions.reduce((acc, s) => acc + s.totalDurationMs, 0);
                                    return (
                                      <td key={dh.dayNumber} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', color: dayMs > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                        {dayMs > 0 ? fmtDur(dayMs) : '-'}
                                      </td>
                                    );
                                  })}
                                  <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', color: 'var(--mimo-accent)', position: 'sticky', right: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                                    {fmtDur(userTotalMs)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })()}


    </div>
  );
}
