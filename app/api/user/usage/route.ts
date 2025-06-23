import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get monthly usage
    const monthlyUsage = await prisma.apiUsage.aggregate({
      where: {
        userId: session.user.id,
        createdAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        totalTokens: true,
        cost: true,
      },
    });

    // Get daily usage
    const dailyUsage = await prisma.apiUsage.aggregate({
      where: {
        userId: session.user.id,
        createdAt: {
          gte: startOfDay,
        },
      },
      _sum: {
        totalTokens: true,
        cost: true,
      },
    });

    // Get user limits
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        monthlyTokenLimit: true,
        dailyTokenLimit: true,
      },
    });

    return NextResponse.json({
      totalTokensThisMonth: monthlyUsage._sum.totalTokens || 0,
      totalCostThisMonth: monthlyUsage._sum.cost || 0,
      totalTokensToday: dailyUsage._sum.totalTokens || 0,
      totalCostToday: dailyUsage._sum.cost || 0,
      monthlyLimit: user?.monthlyTokenLimit,
      dailyLimit: user?.dailyTokenLimit,
    });

  } catch (error) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}