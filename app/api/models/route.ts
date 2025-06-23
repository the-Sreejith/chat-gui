import { NextRequest, NextResponse } from 'next/server';
import { getActiveModels } from '@/lib/models';

export async function GET(request: NextRequest) {
  try {
    const models = await getActiveModels();
    return NextResponse.json(models);
  } catch (error) {
    console.error('Models API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}