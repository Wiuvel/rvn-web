import { NextRequest, NextResponse } from 'next/server';
import { createAdmin, checkAdminExists } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // Валидация входных данных
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    if (username.length < 3 || username.length > 50) {
      return NextResponse.json(
        { error: 'Username must be between 3 and 50 characters' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Проверяем, есть ли уже админы в системе
    const adminExists = await checkAdminExists();
    if (adminExists) {
      return NextResponse.json(
        { error: 'Admin already exists. Registration is not allowed.' },
        { status: 403 }
      );
    }

    // Создаем админа
    const result = await createAdmin(username, password);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create admin' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Admin created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

