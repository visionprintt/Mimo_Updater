'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { updateUser } from '@/lib/firestore';
import { resetPassword } from '@/lib/auth';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useSettingsStore } from '@/store/settingsStore';
import styles from '../dashboard/Dashboard.module.css';

export default function ProfilePage() {
  const { mimoUser } = useAuthStore();
  const { theme, timeFormat, notificationsEnabled, setTheme, setTimeFormat, setNotificationsEnabled } = useSettingsStore();
  
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mimoUser) {
      setDisplayName(mimoUser.displayName || '');
    }
  }, [mimoUser]);

  const handleSaveProfile = async () => {
    if (!mimoUser || !displayName.trim()) return;
    setSaving(true);
    try {
      await updateUser(mimoUser.uid, { displayName: displayName.trim() });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !mimoUser) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${mimoUser.uid}_${Date.now()}`);
      
      // Add a 10-second timeout so it doesn't hang forever if Firebase Storage rules block it or bucket is wrong
      const uploadPromise = uploadBytes(storageRef, file);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out. Check Firebase Storage rules or bucket URL.')), 10000));
      
      await Promise.race([uploadPromise, timeoutPromise]);
      const url = await getDownloadURL(storageRef);
      
      await updateUser(mimoUser.uid, { avatarUrl: url });
      alert('Avatar updated successfully!');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      alert(`Failed to upload avatar: ${error.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handlePasswordReset = async () => {
    if (!mimoUser?.email) return;
    try {
      await resetPassword(mimoUser.email);
      alert('Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Error sending reset email:', error);
      alert(`Failed to send password reset email: ${error.message || 'Unknown error'}`);
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
      } else {
        setNotificationsEnabled(false);
        alert('Notification permission denied by browser.');
      }
    } else {
      alert('Your browser does not support notifications.');
    }
  };

  const handleToggleNotifications = () => {
    if (!notificationsEnabled) {
      requestNotificationPermission();
    } else {
      setNotificationsEnabled(false);
    }
  };

  if (!mounted) {
    return <div style={{ minHeight: '50vh' }}></div>;
  }

  return (
    <>
      <div className={styles.topHeader}>
        <div className={styles.greeting}>
          <h1>My Profile</h1>
          <p>View your employee information and account details.</p>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        <div className={styles.card} style={{ gridColumn: 'span 2' }}>
          <div className={styles.cardTitle}>
            Personal Information
            {!isEditing && mimoUser && (
              <button 
                onClick={() => setIsEditing(true)} 
                style={{
                  background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem'
                }}
              >
                Edit Profile
              </button>
            )}
          </div>
          
          {mimoUser ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Full Name</div>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className={styles.inputField}
                      style={{ marginTop: '0.25rem' }}
                    />
                  ) : (
                    <div style={{ fontSize: '1.125rem', color: '#0f172a', fontWeight: '500' }}>{mimoUser.displayName}</div>
                  )}
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Email Address</div>
                  <div style={{ fontSize: '1.125rem', color: '#0f172a', fontWeight: '500' }}>{mimoUser.email}</div>
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Role</div>
                  <div style={{ fontSize: '1.125rem', color: '#0f172a', fontWeight: '500', textTransform: 'capitalize' }}>{mimoUser.role}</div>
                </div>
              </div>
              <div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Department</div>
                  <div style={{ fontSize: '1.125rem', color: '#0f172a', fontWeight: '500' }}>{mimoUser.departments?.join(', ') || mimoUser.department || 'N/A'}</div>
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Account Status</div>
                  <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', backgroundColor: '#ecfdf5', color: '#10b981', borderRadius: '1rem', fontSize: '0.875rem', fontWeight: '600', textTransform: 'capitalize' }}>
                    {mimoUser.status}
                  </div>
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Joined Date</div>
                  <div style={{ fontSize: '1.125rem', color: '#0f172a', fontWeight: '500' }}>
                    {mimoUser.joinedAt ? new Date(mimoUser.joinedAt).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p>Loading profile...</p>
          )}
          
          {isEditing && (
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className={styles.btnSecondary} onClick={() => setIsEditing(false)} disabled={saving}>
                Cancel
              </button>
              <button className={styles.btnPrimary} onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        <div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Account Settings</div>
            
            {mimoUser?.avatarUrl && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #e2e8f0' }}>
                  <img src={mimoUser.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
            )}

            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: mimoUser?.avatarUrl ? 'center' : 'left' }}>
              Manage your password and security preferences.
            </p>
            
            <button 
              className={styles.btnSecondary} 
              style={{ width: '100%', marginBottom: '1rem' }} 
              onClick={handlePasswordReset}
            >
              Change Password
            </button>
            
            <input 
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }} 
              ref={fileInputRef}
              onChange={handleAvatarUpload}
            />
            <button 
              className={styles.btnSecondary} 
              style={{ width: '100%' }} 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Update Avatar'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.dashboardGrid} style={{ marginTop: '2rem' }}>
        <div className={styles.card} style={{ gridColumn: 'span 2' }}>
          <div className={styles.cardTitle}>Preferences</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Time Format */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '1.5rem' }}>
              <div>
                <div className={styles.settingsGroupTitle} style={{ fontWeight: '600', color: '#0f172a', marginBottom: '0.25rem' }}>Time Format</div>
                <div className={styles.settingsGroupDesc} style={{ fontSize: '0.875rem', color: '#64748b' }}>Select how times are displayed on the timeline.</div>
              </div>
              <select 
                value={timeFormat}
                onChange={(e) => setTimeFormat(e.target.value as '12h' | '24h')}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#0f172a', cursor: 'pointer', outline: 'none' }}
              >
                <option value="12h">12-hour (AM/PM)</option>
                <option value="24h">24-hour</option>
              </select>
            </div>

            {/* Notifications */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className={styles.settingsGroupTitle} style={{ fontWeight: '600', color: '#0f172a', marginBottom: '0.25rem' }}>Desktop Notifications</div>
                <div className={styles.settingsGroupDesc} style={{ fontSize: '0.875rem', color: '#64748b' }}>Receive alerts when sessions are auto-stopped.</div>
              </div>
              <div 
                onClick={handleToggleNotifications}
                style={{ width: '44px', height: '24px', backgroundColor: notificationsEnabled ? '#10b981' : '#cbd5e1', borderRadius: '12px', position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s' }}
              >
                <div style={{ width: '20px', height: '20px', backgroundColor: '#ffffff', borderRadius: '50%', position: 'absolute', top: '2px', left: notificationsEnabled ? '22px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Payment Status</div>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Monthly salary & stipend payment status.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* This Month */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>This Month</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '1rem', marginTop: '0.25rem' }}>
                    {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div>
                  {(() => {
                    const now = new Date();
                    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const status = mimoUser?.paymentStatus?.[key] || 'unpaid';
                    return (
                      <span style={{
                        display: 'inline-block',
                        padding: '0.35rem 0.85rem',
                        backgroundColor: status === 'paid' ? '#ecfdf5' : '#fef3c7',
                        color: status === 'paid' ? '#10b981' : '#d97706',
                        borderRadius: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        textTransform: 'capitalize'
                      }}>
                        {status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Last Month */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Last Month</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '1rem', marginTop: '0.25rem' }}>
                    {(() => {
                      const now = new Date();
                      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    })()}
                  </div>
                </div>
                <div>
                  {(() => {
                    const now = new Date();
                    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
                    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
                    const key = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
                    const status = mimoUser?.paymentStatus?.[key] || 'unpaid';
                    return (
                      <span style={{
                        display: 'inline-block',
                        padding: '0.35rem 0.85rem',
                        backgroundColor: status === 'paid' ? '#ecfdf5' : '#fef3c7',
                        color: status === 'paid' ? '#10b981' : '#d97706',
                        borderRadius: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        textTransform: 'capitalize'
                      }}>
                        {status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
