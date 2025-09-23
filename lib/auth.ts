import bcrypt from 'bcryptjs';
import { supabaseAdmin, Admin } from './supabase';

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function createAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'Database not configured' };
    }

    // Проверяем, существует ли уже админ с таким username
    const { data: existingAdmin, error: checkError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('username', username)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking existing admin:', checkError);
      return { success: false, error: 'Database error' };
    }

    if (existingAdmin) {
      return { success: false, error: 'Admin with this username already exists' };
    }

    // Хешируем пароль
    const passwordHash = await hashPassword(password);

    // Создаем нового админа
    const { error: insertError } = await supabaseAdmin
      .from('admins')
      .insert({
        username,
        password_hash: passwordHash
      });

    if (insertError) {
      console.error('Error creating admin:', insertError);
      return { success: false, error: 'Failed to create admin' };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error creating admin:', error);
    return { success: false, error: 'Unexpected error' };
  }
}

export async function authenticateAdmin(username: string, password: string): Promise<{ success: boolean; admin?: Admin; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'Database not configured' };
    }

    // Ищем админа по username
    const { data: admin, error: fetchError } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('username', username)
      .single();

    if (fetchError) {
      console.error('Error fetching admin:', fetchError);
      return { success: false, error: 'Invalid credentials' };
    }

    if (!admin) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Проверяем пароль
    const isValidPassword = await verifyPassword(password, admin.password_hash);
    
    if (!isValidPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    return { success: true, admin };
  } catch (error) {
    console.error('Unexpected error authenticating admin:', error);
    return { success: false, error: 'Unexpected error' };
  }
}

export async function checkAdminExists(): Promise<boolean> {
  try {
    if (!supabaseAdmin) {
      return false;
    }

    const { data, error } = await supabaseAdmin
      .from('admins')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Error checking admin existence:', error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('Unexpected error checking admin existence:', error);
    return false;
  }
}
