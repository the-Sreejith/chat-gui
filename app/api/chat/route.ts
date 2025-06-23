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
  stream: z.boolean().default(false),
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
    const { conversationId, message, modelId, stream } = chatSchema.parse(body);

    // Get or create conversation
    let conversation;
    let isNewConversation = false;
    
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
      // Create new conversation with temporary title
      conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          title: 'New Conversation',
        },
        include: {
          messages: true,
        },
      });
      isNewConversation = true;
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
    
    if (stream) {
      // Handle streaming response
      return handleStreamingResponse(
        aiManager,
        messages,
        providerName,
        selectedModel,
        conversation,
        user,
        isNewConversation,
        message
      );
    }

    // Use the model identifier for the API call
    const response = await aiManager.chat(
      messages, 
      providerName,
      selectedModel.modelIdentifier
    );

    // Calculate costs based on actual model pricing
    const inputTokens = response.inputTokens || Math.ceil(messages.map(m => m.content).join(' ').length / 4);
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

    // Generate conversation title if this is a new conversation
    if (isNewConversation) {
      generateConversationTitle(conversation.id, message, selectedModel, aiManager, providerName);
    }

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

async function handleStreamingResponse(
  aiManager: AIProviderManager,
  messages: any[],
  providerName: 'openrouter' | 'gemini',
  selectedModel: any,
  conversation: any,
  user: any,
  isNewConversation: boolean,
  userMessage: string
) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // For now, we'll simulate streaming by getting the full response and chunking it
        // In a real implementation, you'd use the streaming APIs of the providers
        const response = await aiManager.chat(
          messages, 
          providerName,
          selectedModel.modelIdentifier
        );

        // Calculate costs
        const inputTokens = response.inputTokens || Math.ceil(messages.map(m => m.content).join(' ').length / 4);
        const outputTokens = response.outputTokens || Math.ceil(response.content.length / 4);
        const totalTokens = inputTokens + outputTokens;
        
        const inputCost = (inputTokens / 1000) * Number(selectedModel.inputPricePer1kTokens);
        const outputCost = (outputTokens / 1000) * Number(selectedModel.outputPricePer1kTokens);
        const totalCost = inputCost + outputCost;

        // Simulate streaming by sending chunks
        const words = response.content.split(' ');
        let currentContent = '';

        for (let i = 0; i < words.length; i++) {
          currentContent += (i > 0 ? ' ' : '') + words[i];
          
          const chunk = {
            type: 'content',
            content: currentContent,
            delta: words[i] + (i < words.length - 1 ? ' ' : ''),
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          
          // Add small delay to simulate real streaming
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Save the complete message to database
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

        // Send final chunk with metadata
        const finalChunk = {
          type: 'done',
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
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));

        // Generate conversation title if this is a new conversation
        if (isNewConversation) {
          generateConversationTitle(conversation.id, userMessage, selectedModel, aiManager, providerName);
        }

        controller.close();
      } catch (error) {
        console.error('Streaming error:', error);
        const errorChunk = {
          type: 'error',
          error: 'Failed to generate response',
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Background function to generate conversation title
async function generateConversationTitle(
  conversationId: string,
  userMessage: string,
  selectedModel: any,
  aiManager: AIProviderManager,
  providerName: 'openrouter' | 'gemini'
) {
  try {
    const titlePrompt = [
      {
        role: 'system' as const,
        content: 'Generate a concise, descriptive title (max 50 characters) for a conversation that starts with the following user message. Return only the title, no quotes or extra text.',
      },
      {
        role: 'user' as const,
        content: userMessage,
      },
    ];

    const titleResponse = await aiManager.chat(
      titlePrompt,
      providerName,
      selectedModel.modelIdentifier
    );

    const title = titleResponse.content.trim().replace(/^["']|["']$/g, '').slice(0, 50);

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  } catch (error) {
    console.error('Failed to generate conversation title:', error);
    // Keep the default title if generation fails
  }
}