'use client';

import React, { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useAuthStore } from '@/store/authStore';
import { getTasksByEmployee, addTask, updateTask, deleteTask, createAuditLog } from '@/lib/firestore';
import type { MimoTask, TaskPriority, TaskStatus } from '@/types';
import styles from '../dashboard/Dashboard.module.css';

export default function TasksPage() {
  const { mimoUser } = useAuthStore();
  const { draftTasks, setDraftTasks, isWorking } = useSessionStore();
  
  const [tasks, setTasks] = useState<MimoTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  
  // New Task Form State
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Medium');
  
  // Default to tomorrow 5 PM
  const getDefaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0);
    // Format for datetime-local input: YYYY-MM-DDThh:mm
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const [newDueDate, setNewDueDate] = useState(getDefaultDate());

  useEffect(() => {
    if (mimoUser) {
      loadTasks();
    }
  }, [mimoUser]);

  const loadTasks = async () => {
    if (!mimoUser) return;
    setLoadingTasks(true);
    try {
      const data = await getTasksByEmployee(mimoUser.uid);
      setTasks(data);
    } catch (e) {
      console.error('Failed to load tasks', e);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleAddSessionTask = () => {
    if (!newTaskTitle.trim()) {
      alert('Please enter what you are working on before adding a task.');
      return;
    }
    const id = Math.random().toString(36).substr(2, 9);
    setDraftTasks([...draftTasks, { id, title: newTaskTitle, description: '', category: 'Development' }]);
    setNewTaskTitle('');
  };

  const handleRemoveSessionTask = (id: string) => {
    setDraftTasks(draftTasks.filter(t => t.id !== id));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mimoUser || !newTitle.trim() || !newDueDate) return;

    try {
      const dueDateIso = new Date(newDueDate).toISOString();
      const taskId = await addTask({
        title: newTitle.trim(),
        description: newDesc.trim(),
        assignedTo: mimoUser.uid,
        assignedBy: mimoUser.uid,
        priority: newPriority,
        status: 'pending',
        startDate: new Date().toISOString(),
        dueDate: dueDateIso,
      });

      await createAuditLog({
        actorId: mimoUser.uid,
        actorName: mimoUser.displayName,
        action: 'TASK_CREATED',
        targetId: taskId,
        details: `Created a new task: "${newTitle}"`,
        createdAt: new Date().toISOString()
      });

      setShowTaskForm(false);
      setNewTitle('');
      setNewDesc('');
      setNewPriority('Medium');
      setNewDueDate(getDefaultDate());
      loadTasks();
    } catch (e) {
      console.error(e);
      alert('Failed to add task.');
    }
  };

  const handleUpdateStatus = async (task: MimoTask, newStatus: TaskStatus) => {
    try {
      const updates: Partial<MimoTask> = { status: newStatus };
      if (newStatus === 'completed') {
        updates.completedAt = new Date().toISOString();
      } else {
        updates.completedAt = '';
      }
      await updateTask(task.id, updates);
      
      if (newStatus === 'completed') {
         await createAuditLog({
          actorId: mimoUser!.uid,
          actorName: mimoUser!.displayName,
          action: 'TASK_COMPLETED',
          targetId: task.id,
          details: `Completed task: "${task.title}"`,
          createdAt: new Date().toISOString()
        });
      }
      
      loadTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateDueDate = async (task: MimoTask, newDateStr: string) => {
    if (!newDateStr) return;
    try {
      const newIso = new Date(newDateStr).toISOString();
      await updateTask(task.id, { dueDate: newIso });
      loadTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteTask(id);
      loadTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const isTaskOverdue = (task: MimoTask) => {
    return task.status !== 'completed' && task.status !== 'cancelled' && new Date() > new Date(task.dueDate);
  };

  const calculateDelayDays = (task: MimoTask) => {
    const due = new Date(task.dueDate).getTime();
    const compareTime = task.status === 'completed' && task.completedAt ? new Date(task.completedAt).getTime() : new Date().getTime();
    
    if (compareTime <= due) return 0;
    
    const diffTime = Math.abs(compareTime - due);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <>
      <div className={styles.topHeader}>
        <div className={styles.greeting}>
          <h1>Tasks</h1>
          <p>Manage your current session tasks and long-term assignments.</p>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        {/* Session Tasks - Left Column */}
        <div className={styles.card} style={{ gridColumn: 'span 1' }}>
          <div className={styles.cardTitle}>Current Session Tasks</div>
          
          {!isWorking ? (
            <p style={{ color: '#64748b' }}>Start a session on the Dashboard to add active tasks.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <input 
                  type="text" 
                  value={newTaskTitle} 
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="What are you working on right now?" 
                  className={styles.inputField} 
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSessionTask()}
                />
                <button className={styles.btnPrimary} onClick={handleAddSessionTask}>Add</button>
              </div>

              {draftTasks.length === 0 ? (
                <p style={{ color: '#64748b' }}>No session tasks added yet.</p>
              ) : (
                <div className={styles.completedList}>
                  {draftTasks.map(t => (
                    <div className={styles.completedItem} key={t.id} style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', justifyItems: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                        <div className={styles.completedIcon}></div>
                        <div className={styles.completedInfo}>
                          <div className={styles.completedTitle} style={{ fontSize: '1rem' }}>{t.title || 'Untitled Task'}</div>
                          <div className={styles.completedTime}>In Progress</div>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveSessionTask(t.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0 8px' }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Assigned Tasks - Right Column */}
        <div className={styles.card} style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div className={styles.cardTitle} style={{ margin: 0 }}>Assigned Tasks</div>
            <button className={styles.btnPrimary} onClick={() => setShowTaskForm(!showTaskForm)}>
              {showTaskForm ? 'Cancel' : '+ New Task'}
            </button>
          </div>

          {showTaskForm && (
            <form onSubmit={handleCreateTask} className="glass-card-static" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Task Title *</label>
                <input required type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} className={styles.inputField} placeholder="e.g. Build Login API" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Description</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className={styles.inputField} placeholder="Brief details about the task..." style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Priority</label>
                  <select value={newPriority} onChange={e => setNewPriority(e.target.value as TaskPriority)} className={styles.inputField}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Due Date *</label>
                  <input required type="datetime-local" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className={styles.inputField} />
                </div>
              </div>
              <button type="submit" className={styles.btnPrimary} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>Create Task</button>
            </form>
          )}

          {loadingTasks ? (
            <p style={{ color: '#64748b' }}>Loading tasks...</p>
          ) : tasks.length === 0 ? (
            <p style={{ color: '#64748b' }}>No tasks assigned.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {tasks.map(t => {
                const overdue = isTaskOverdue(t);
                const delayDays = calculateDelayDays(t);
                const isCompletedLate = t.status === 'completed' && delayDays > 0;
                // Employee can edit deadline ONLY before it expires
                const canEditDeadline = t.status !== 'completed' && !overdue;

                return (
                  <div key={t.id} className="glass-card-static" style={{ 
                    padding: '1.25rem', 
                    border: overdue ? '1px solid #fca5a5' : 'none', 
                    position: 'relative',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', color: t.status === 'completed' ? '#94a3b8' : '#0f172a', textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>
                            {t.title}
                          </h3>
                          <span style={{ 
                            fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 600,
                            background: t.priority === 'High' ? '#fee2e2' : t.priority === 'Medium' ? '#fef3c7' : '#f1f5f9',
                            color: t.priority === 'High' ? '#ef4444' : t.priority === 'Medium' ? '#d97706' : '#64748b'
                          }}>
                            {t.priority}
                          </span>
                        </div>
                        {t.description && <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#64748b' }}>{t.description}</p>}
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                          {/* Workflow Status Dropdown */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Status:</span>
                            <select 
                              value={t.status}
                              onChange={(e) => handleUpdateStatus(t, e.target.value as TaskStatus)}
                              className={styles.inputField}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '13px', height: 'auto' }}
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>

                          {/* Due Date Info/Picker */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Due:</span>
                            {canEditDeadline ? (
                               <input 
                                 type="datetime-local" 
                                 value={new Date(new Date(t.dueDate).getTime() - new Date(t.dueDate).getTimezoneOffset() * 60000).toISOString().slice(0, 16)} 
                                 onChange={(e) => handleUpdateDueDate(t, e.target.value)}
                                 className={styles.inputField}
                                 style={{ padding: '0.25rem 0.5rem', fontSize: '13px', height: 'auto' }}
                               />
                            ) : (
                               <span style={{ fontSize: '13px', color: '#0f172a' }}>{new Date(t.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            )}
                          </div>
                          
                          {/* Computed Status Badges */}
                          {overdue && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontSize: '13px', fontWeight: 600, background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                              Delayed by {delayDays} day{delayDays !== 1 ? 's' : ''}
                            </div>
                          )}
                          
                          {isCompletedLate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#d97706', fontSize: '13px', fontWeight: 600, background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>
                              Completed {delayDays} day{delayDays !== 1 ? 's' : ''} late
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button onClick={() => handleRemoveTask(t.id)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '1.25rem', padding: '4px' }}>
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
