import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkAuth } from '@/lib/auth/helper';
import { supabaseAdmin } from '@/lib/database/supabase';
import { createHash } from 'crypto';
import SettingsClient from '@/components/dashboard/SettingsClient';
import { UserData } from '@/types';
import { hasUserRole } from '@/lib/auth/user-roles';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const auth = await checkAuth(undefined, { readOnly: true });
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (token && (!auth.isAuthenticated || !auth.user)) {
    redirect('/api/auth/restore?redirect=/auth');
  }

  if (!auth.isAuthenticated || !auth.user) {
    redirect('/auth');
  }

  if (!supabaseAdmin) {
    console.error('Database connection failed');
    return null;
  }

  const { data: devices, error } = await supabaseAdmin
    .from('user_devices')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('last_active', { ascending: false });

  if (error) {
    console.error('Failed to fetch devices', error);
  }

  const currentToken = token;
  const currentTokenHash = currentToken
    ? createHash('sha256').update(currentToken).digest('hex')
    : null;

  const initialDevices = (devices || []).map((d) => ({
    id: d.id,
    device_name: d.device_name,
    ip_address: d.ip_address,
    location: d.location,
    last_active: d.last_active,
    created_at: d.created_at,
    is_current: d.token_hash === currentTokenHash,
  }));

  const user = auth.user;
  const [isSupport, isAdmin] = await Promise.all([
    hasUserRole(user.id, 'support'),
    hasUserRole(user.id, 'admin'),
  ]);

  const userData: UserData = {
    id: user.id,
    user_id: user.user_id,
    username: user.username,
    avatar: user.avatar,
    banner: user.banner,
    token: token || user.token,
    isSupport,
    isAdmin,
    created_at: user.created_at,
    pex: isAdmin ? 'a' : isSupport ? 's' : 'u',
  };

  return (
    <SettingsClient
      key={JSON.stringify(initialDevices)}
      userData={userData}
      initialDevices={initialDevices}
    />
  );
}
