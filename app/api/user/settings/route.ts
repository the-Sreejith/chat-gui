import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const settingsSchema = z.object({
  preferredModelId: z.string().optional(),
  theme: z.string().default('light'),
  openrouterApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  monthlyTokenLimit: z.number().optional(),
  dailyTokenLimit: z.number().optional(),
  billingAlertThreshold: z.number().optional(),
  billingAlertsEnabled: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        preferredModelId: true,
        theme: true,
        openrouterApiKey: true,
        geminiApiKey: true,
        monthlyTokenLimit: true,
        dailyTokenLimit: true,
        billingAlertThreshold: true,
        billingAlertsEnabled: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(user);

  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const settings = settingsSchema.parse(body);

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: settings,
      select: {
        preferredModelId: true,
        theme: true,
        openrouterApiKey: true,
        geminiApiKey: true,
        monthlyTokenLimit: true,
        dailyTokenLimit: true,
        billingAlertThreshold: true,
        billingAlertsEnabled: true,
      },
    });

    return NextResponse.json(updatedUser);

  } catch (error) {
    console.error('Settings update API error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}