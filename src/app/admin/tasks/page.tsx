'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAllTasks, getAllUsers, updateTask, createAuditLog } from '@/lib/firestore';
import type { MimoTask, MimoUser, TaskPriority } from '@/types';
import styles from '../dashboard/Dashboard.module.css'; // Reusing dashboard styles for consistency

export default function AdminTasksPage() {
  const { mimoUser } = useAuthStore();
  
  const [tasks, setTasks] = useState<MimoTask[]>([]);
  const [users, setUsers] = useState<Record<string, MimoUser>>({});
  const [loading, setLoading] = useState(true);

  // Edit State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState('');
  const [editReason, setEditReason] = useState('');
  
  // Reassign State
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [reassignUserId, setReassignUserId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allTasks, allUsersArr] = await Promise.all([
        getAllTasks(),
        getAllUsers()
      ]);
      setTasks(allTasks);
      
      const userMap: Record<string, MimoUser> = {};
      allUsersArr.forEach(u => { userMap[u.uid] = u; });
      setUsers(userMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isTaskOverdue = (task: MimoTask) => {
    return task.status !== 'completed' && task.status !== 'cancelled' && new Date() > new Date(task.dueDate);
  };

  const calculateDelayDays = (task: MimoTask) => {
    const due = new Date(task.dueDate).getTime();
    const compareTime = task.status === 'completed' && task.completedAt ? new Date(task.completedAt).getTime() : new Date().getTime();
    if (compareTime <= due) return 0;
    const diffDays = Math.ceil((compareTime - due) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleUpdatePriority = async (task: MimoTask, newPriority: TaskPriority) => {
    try {
      await updateTask(task.id, { priority: newPriority });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveDeadline = async (task: MimoTask) => {
    if (!editDueDate || !editReason.trim() || !mimoUser) return;
    try {
      const newIso = new Date(editDueDate).toISOString();
      await updateTask(task.id, { 
        dueDate: newIso,
        delayReason: editReason.trim(),
        deadlineUpdatedBy: mimoUser.uid,
        deadlineUpdatedAt: new Date().toISOString()
      });
      
      await createAuditLog({
        actorId: mimoUser.uid,
        actorName: mimoUser.displayName,
        action: 'DEADLINE_UPDATED',
        targetId: task.id,
        details: `Updated deadline for task "${task.title}". Reason: ${editReason.trim()}`,
        createdAt: new Date().toISOString()
      });

      setEditingTaskId(null);
      setEditDueDate('');
      setEditReason('');
      loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to update deadline.');
    }
  };

  const handleSaveReassign = async (task: MimoTask) => {
    if (!reassignUserId || !mimoUser) return;
    try {
      await updateTask(task.id, { 
        assignedTo: reassignUserId
      });
      
      const user = Object.values(users).find(u => u.uid === reassignUserId);
      await createAuditLog({
        actorId: mimoUser.uid,
        actorName: mimoUser.displayName,
        action: 'TASK_REASSIGNED',
        targetId: task.id,
        details: `Reassigned task "${task.title}" to ${user?.displayName || 'Unknown'}`,
        createdAt: new Date().toISOString()
      });

      setReassignTaskId(null);
      setReassignUserId('');
      loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to reassign task.');
    }
  };

  // Grouping for neat table presentation
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Overdue first, then by nearest deadline
      const aOverdue = isTaskOverdue(a);
      const bOverdue = isTaskOverdue(b);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [tasks]);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>Task Management</h1>
        <p style={{ margin: 0, color: '#64748b' }}>Overview of all employee tasks and deadlines.</p>
      </div>

      {loading ? (
        <p>Loading tasks...</p>
      ) : (
        <div className="glass-card-static" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Employee</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Task</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Priority</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Due Date / Deadlines</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map(t => {
                const user = users[t.assignedTo];
                const overdue = isTaskOverdue(t);
                const delayDays = calculateDelayDays(t);
                const isCompletedLate = t.status === 'completed' && delayDays > 0;
                const isEditingDeadline = editingTaskId === t.id;
                const isReassigning = reassignTaskId === t.id;

                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '12px' }}>
                          {user?.displayName.charAt(0).toUpperCase() || '?'}
                        </div>
                        <span style={{ fontWeight: 500, color: '#0f172a' }}>{user?.displayName || 'Unknown'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 500, color: '#0f172a' }}>{t.title}</div>
                      {t.delayReason && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Ext: {t.delayReason}</div>}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <select 
                        value={t.priority}
                        onChange={(e) => handleUpdatePriority(t, e.target.value as TaskPriority)}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '13px' }}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', color: t.status === 'completed' ? '#10b981' : t.status === 'in_progress' ? '#3b82f6' : '#64748b', fontWeight: 600 }}>
                          {t.status.replace('_', ' ').toUpperCase()}
                        </span>
                        {overdue && (
                           <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>Overdue by {delayDays}d</span>
                        )}
                        {isCompletedLate && (
                           <span style={{ fontSize: '12px', color: '#d97706', fontWeight: 600 }}>Completed {delayDays}d late</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {isEditingDeadline ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <input 
                            type="datetime-local" 
                            value={editDueDate}
                            onChange={(e) => setEditDueDate(e.target.value)}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                          />
                          <input 
                            type="text" 
                            placeholder="Reason for extension"
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                          />
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => handleSaveDeadline(t)} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditingTaskId(null)} style={{ background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#0f172a' }}>
                          {new Date(t.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px' }}>
                       {isReassigning ? (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                           <select 
                             value={reassignUserId}
                             onChange={e => setReassignUserId(e.target.value)}
                             style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                           >
                             <option value="">Select User...</option>
                             {Object.values(users).map(u => (
                               <option key={u.uid} value={u.uid}>{u.displayName}</option>
                             ))}
                           </select>
                           <div style={{ display: 'flex', gap: '4px' }}>
                             <button onClick={() => handleSaveReassign(t)} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                             <button onClick={() => setReassignTaskId(null)} style={{ background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                           </div>
                         </div>
                       ) : (
                         <div style={{ display: 'flex', gap: '8px' }}>
                           {!isEditingDeadline && (
                             <button 
                               onClick={() => {
                                 setEditingTaskId(t.id);
                                 setEditDueDate(new Date(new Date(t.dueDate).getTime() - new Date(t.dueDate).getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                                 setEditReason('');
                                 setReassignTaskId(null);
                               }}
                               style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: '#475569', fontWeight: 500 }}
                             >
                               Edit Deadline
                             </button>
                           )}
                           <button 
                               onClick={() => {
                                 setReassignTaskId(t.id);
                                 setReassignUserId(t.assignedTo);
                                 setEditingTaskId(null);
                               }}
                               style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: '#475569', fontWeight: 500 }}
                             >
                               Reassign
                           </button>
                         </div>
                       )}
                    </td>
                  </tr>
                );
              })}
              
              {sortedTasks.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>No tasks found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
