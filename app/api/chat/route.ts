import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AIProviderManager } from '@/lib/ai-providers';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const chatSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
  modelId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the user from database to ensure they exist and get the correct ID
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Rate limiting
    const rateLimitResult = rateLimit(
      user.id,
      parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '10')
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          resetTime: rateLimitResult.resetTime 
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { conversationId, message, modelId } = chatSchema.parse(body);

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId: user.id,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20, // Limit context window
          },
        },
      });

      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }
    } else {
      conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        },
        include: {
          messages: true,
        },
      });
    }

    // Add user message to database
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: message,
      },
    });

    // Get selected model or use default
    let selectedModel = null;
    if (modelId) {
      selectedModel = await prisma.model.findUnique({
        where: { id: modelId },
        include: { provider: true },
      });
    }

    // If no model selected or model not found, use user's preferred model or default
    if (!selectedModel) {
      selectedModel = await prisma.model.findFirst({
        where: {
          OR: [
            { id: user.preferredModelId || '' },
            { modelIdentifier: 'claude-sonnet-4' }, // Default fallback
            { isActive: true }, // Any active model as last resort
          ],
        },
        include: { provider: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!selectedModel) {
      return NextResponse.json(
        { error: 'No available AI models found' },
        { status: 500 }
      );
    }

    // Prepare messages for AI
    const messages = [
      ...conversation.messages.map(msg => ({
        role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Get AI response
    const aiManager = new AIProviderManager();
    const providerName = selectedModel.provider.name as 'openrouter' | 'gemini';
    
    // Use the model identifier for the API call
    const response = await aiManager.chat(
      messages, 
      providerName,
      selectedModel.modelIdentifier
    );

    // Calculate costs based on actual model pricing
    const inputTokens = response.inputTokens || Math.ceil(messages.join(' ').length / 4);
    const outputTokens = response.outputTokens || Math.ceil(response.content.length / 4);
    const totalTokens = inputTokens + outputTokens;
    
    const inputCost = (inputTokens / 1000) * Number(selectedModel.inputPricePer1kTokens);
    const outputCost = (outputTokens / 1000) * Number(selectedModel.outputPricePer1kTokens);
    const totalCost = inputCost + outputCost;

    // Save AI response to database
    const aiMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: response.content,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        tokens: totalTokens,
        cost: totalCost,
        modelId: selectedModel.id,
      },
      include: {
        model: {
          include: {
            provider: true,
          },
        },
      },
    });

    // Track API usage
    await prisma.apiUsage.create({
      data: {
        userId: user.id,
        modelId: selectedModel.id,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        totalTokens: totalTokens,
        cost: totalCost,
        endpoint: '/api/chat',
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      message: aiMessage,
      conversationId: conversation.id,
      usage: {
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        totalTokens: totalTokens,
        cost: totalCost,
        model: selectedModel.modelName,
        provider: selectedModel.provider.displayName,
      },
    });

  } catch (error) {
    console.error('Chat API error:', error);
    
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