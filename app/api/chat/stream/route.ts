import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AIProviderManager } from '@/lib/ai-providers';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const streamChatSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
  modelId: z.string().optional(),
});

interface StreamState {
  fullContent: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  isComplete: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  let streamState: StreamState = {
    fullContent: '',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0,
    isComplete: false,
  };

  let conversation: any = null;
  let selectedModel: any = null;
  let user: any = null;
  let isNewConversation = false;
  let userMessage = '';

  try {
    // Authentication and validation
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    user = await prisma.user.findUnique({
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
    const { conversationId, message, modelId } = streamChatSchema.parse(body);
    userMessage = message;

    // Get or create conversation
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId: user.id,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20,
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
          title: 'New Conversation',
        },
        include: {
          messages: true,
        },
      });
      isNewConversation = true;
    }

    // Get selected model
    if (modelId) {
      selectedModel = await prisma.model.findUnique({
        where: { id: modelId },
        include: { provider: true },
      });
    }

    if (!selectedModel) {
      selectedModel = await prisma.model.findFirst({
        where: {
          OR: [
            { id: user.preferredModelId || '' },
            { modelIdentifier: 'claude-sonnet-4' },
            { isActive: true },
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

    // Add user message to database immediately
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: message,
      },
    });

    // Prepare messages for AI
    const messages = [
      ...conversation.messages.map((msg:any) => ({
        role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Create streaming response
    const encoder = new TextEncoder();
    const aiManager = new AIProviderManager();
    const providerName = selectedModel.provider.name as 'openrouter' | 'gemini';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'start',
            conversationId: conversation.id,
            model: selectedModel.modelName,
            provider: selectedModel.provider.displayName,
          })}\n\n`));

          // Start streaming from AI provider
          const streamGenerator = aiManager.chatStream(
            messages,
            providerName,
            selectedModel.modelIdentifier
          );

          let chunkCount = 0;
          let lastContentLength = 0;

          for await (const chunk of streamGenerator) {
            chunkCount++;
            
            // Check if client disconnected
            if (controller.desiredSize === null) {
              console.log('Client disconnected, stopping stream');
              break;
            }

            if (chunk.type === 'content' && chunk.delta) {
              streamState.fullContent += chunk.delta;
              
              // Send content chunk to client
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'content',
                delta: chunk.delta,
                content: streamState.fullContent,
              })}\n\n`));

              // Log progress every 10 chunks or significant content changes
              if (chunkCount % 10 === 0 || streamState.fullContent.length - lastContentLength > 100) {
                console.log(`📡 Streaming progress: ${streamState.fullContent.length} chars, ${chunkCount} chunks`);
                lastContentLength = streamState.fullContent.length;
              }

            } else if (chunk.type === 'done') {
              streamState.isComplete = true;
              
              // Calculate final metrics
              streamState.inputTokens = Math.ceil(messages.map(m => m.content).join(' ').length / 4);
              streamState.outputTokens = Math.ceil(streamState.fullContent.length / 4);
              streamState.totalTokens = streamState.inputTokens + streamState.outputTokens;
              
              const inputCost = (streamState.inputTokens / 1000) * Number(selectedModel.inputPricePer1kTokens);
              const outputCost = (streamState.outputTokens / 1000) * Number(selectedModel.outputPricePer1kTokens);
              streamState.cost = inputCost + outputCost;

              console.log(`✅ Stream completed successfully:
                - Total chunks: ${chunkCount}
                - Content length: ${streamState.fullContent.length} chars
                - Tokens: ${streamState.totalTokens} (${streamState.inputTokens}→${streamState.outputTokens})
                - Cost: $${streamState.cost.toFixed(6)}`);

              // Send completion status
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'complete',
                totalTokens: streamState.totalTokens,
                cost: streamState.cost,
              })}\n\n`));

              break;

            } else if (chunk.type === 'error') {
              streamState.error = chunk.error || 'Unknown streaming error';
              
              console.error(`❌ Stream error after ${chunkCount} chunks:`, streamState.error);
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                error: streamState.error,
              })}\n\n`));
              
              throw new Error(streamState.error);
            }
          }

          // Verify stream completion and write to database
          if (streamState.isComplete && streamState.fullContent.trim()) {
            console.log('💾 Writing completed stream to database...');
            
            await writeCompletedStreamToDatabase(
              streamState,
              conversation,
              selectedModel,
              user,
              isNewConversation,
              userMessage,
              aiManager,
              providerName
            );

            // Send final success message
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              conversationId: conversation.id,
              usage: {
                inputTokens: streamState.inputTokens,
                outputTokens: streamState.outputTokens,
                totalTokens: streamState.totalTokens,
                cost: streamState.cost,
                model: selectedModel.modelName,
                provider: selectedModel.provider.displayName,
              },
            })}\n\n`));
          } else {
            const errorMsg = `Stream completion failed: isComplete=${streamState.isComplete}, contentLength=${streamState.fullContent.length}`;
            console.error('❌', errorMsg);
            throw new Error(errorMsg);
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

        } catch (error) {
          console.error('❌ Streaming error:', error);
          
          // Send error to client
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error occurred',
          })}\n\n`));
          
          controller.close();
        }
      },

      cancel() {
        console.log('🚫 Stream cancelled by client');
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('❌ Stream setup error:', error);
    
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

async function writeCompletedStreamToDatabase(
  streamState: StreamState,
  conversation: any,
  selectedModel: any,
  user: any,
  isNewConversation: boolean,
  userMessage: string,
  aiManager: AIProviderManager,
  providerName: 'openrouter' | 'gemini'
) {
  try {
    // Use a transaction to ensure data consistency
    await prisma.$transaction(async (tx) => {
      // Save AI response message
      const aiMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: streamState.fullContent,
          inputTokens: streamState.inputTokens,
          outputTokens: streamState.outputTokens,
          tokens: streamState.totalTokens,
          cost: streamState.cost,
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
      await tx.apiUsage.create({
        data: {
          userId: user.id,
          modelId: selectedModel.id,
          inputTokens: streamState.inputTokens,
          outputTokens: streamState.outputTokens,
          totalTokens: streamState.totalTokens,
          cost: streamState.cost,
          endpoint: '/api/chat/stream',
        },
      });

      // Update conversation timestamp
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      console.log(`✅ Successfully wrote stream completion to database:
        - Message ID: ${aiMessage.id}
        - Tokens: ${streamState.totalTokens}
        - Cost: $${streamState.cost.toFixed(6)}
        - Content length: ${streamState.fullContent.length} chars`);
    });

    // Generate conversation title if this is a new conversation (outside transaction)
    if (isNewConversation) {
      generateConversationTitle(
        conversation.id,
        userMessage,
        selectedModel,
        aiManager,
        providerName
      ).catch(error => {
        console.error('Failed to generate conversation title:', error);
      });
    }

  } catch (error) {
    console.error('❌ Failed to write stream completion to database:', error);
    throw new Error('Database write failed after stream completion');
  }
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

    console.log(`✅ Generated conversation title: "${title}"`);
  } catch (error) {
    console.error('Failed to generate conversation title:', error);
  }
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}