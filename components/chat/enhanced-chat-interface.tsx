'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Bot,
  User,
  Loader2,
  Copy,
  Check,
  Edit3,
  Trash2,
  MoreHorizontal,
  Sparkles,
  Square,
  AlertCircle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ModelSelector } from './model-selector';
import { MarkdownMessage } from './markdown-message';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  model?: {
    id: string;
    modelName: string;
    provider: {
      displayName: string;
    };
  };
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

interface EnhancedChatInterfaceProps {
  conversation?: Conversation;
  onNewMessage?: () => void;
}

interface StreamingState {
  isStreaming: boolean;
  content: string;
  error?: string;
  metadata?: any;
}

export function EnhancedChatInterface({ conversation, onNewMessage }: EnhancedChatInterfaceProps) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>(conversation?.messages || []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    content: '',
  });
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const { data: session } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(conversation?.messages || []);
  }, [conversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingState.content]);

  // Auto-resize textarea function
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';

      // Calculate the new height
      const scrollHeight = textarea.scrollHeight;
      const minHeight = 60; // min-h-[60px]
      const maxHeight = 200; // max-h-[200px]

      // Set the height within bounds
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  };

  // Handle message change and auto-resize
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Use setTimeout to ensure the DOM is updated before calculating height
    setTimeout(adjustTextareaHeight, 0);
  };

  // Adjust height on mount and when message changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const stopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsLoading(false);
      setStreamingState({ isStreaming: false, content: '' });

      toast({
        title: 'Generation stopped',
        description: 'The AI response generation has been cancelled.',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setMessage('');
    setIsLoading(true);
    setStreamingState({ isStreaming: true, content: '' });

    // Reset textarea height after clearing message
    setTimeout(adjustTextareaHeight, 0);

    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      id: 'temp-user-' + Date.now(),
      role: 'USER',
      content: userMessage,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          conversationId: conversation?.id,
          modelId: selectedModelId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let streamContent = '';
      let finalMessageData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setStreamingState({ isStreaming: false, content: '' });
              break;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'start') {
                setStreamingState(prev => ({
                  ...prev,
                  metadata: parsed
                }));
              } else if (parsed.type === 'content') {
                if (parsed.delta) {
                  streamContent += parsed.delta;
                } else {
                  streamContent = parsed.content;
                }
                setStreamingState(prev => ({
                  ...prev,
                  content: streamContent
                }));
              } else if (parsed.type === 'complete') {
                // Stream completion verification
                console.log('✅ Stream completed successfully:', {
                  tokens: parsed.totalTokens,
                  cost: parsed.cost,
                });
              } else if (parsed.type === 'done') {
                finalMessageData = parsed;

                // Remove temp user message and add both real messages
                setMessages(prev => {
                  const withoutTemp = prev.filter(msg => msg.id !== tempUserMessage.id);
                  return [
                    ...withoutTemp,
                    {
                      id: 'user-' + Date.now(),
                      role: 'USER',
                      content: userMessage,
                      createdAt: new Date().toISOString(),
                    },
                    {
                      id: 'assistant-' + Date.now(),
                      role: 'ASSISTANT',
                      content: streamContent,
                      createdAt: new Date().toISOString(),
                      inputTokens: parsed.usage?.inputTokens,
                      outputTokens: parsed.usage?.outputTokens,
                      cost: parsed.usage?.cost,
                      model: {
                        id: selectedModelId,
                        modelName: parsed.usage?.model || 'Unknown',
                        provider: {
                          displayName: parsed.usage?.provider || 'Unknown',
                        },
                      },
                    }
                  ];
                });

                // If this is a new conversation, redirect to it
                if (!conversation?.id && parsed.conversationId) {
                  router.push(`/chat/${parsed.conversationId}`);
                }

                onNewMessage?.();
                setStreamingState({ isStreaming: false, content: '' });
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }
            } catch (e) {
              console.warn('Failed to parse streaming JSON:', data);
            }
          }
        }
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Request was aborted, clean up
        setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
        setStreamingState({ isStreaming: false, content: '' });
        return;
      }

      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));

      setStreamingState({
        isStreaming: false,
        content: '',
        error: error.message
      });

      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy text',
        variant: 'destructive',
      });
    }
  };

  const formatTokenCount = (inputTokens?: number, outputTokens?: number) => {
    if (!inputTokens && !outputTokens) return null;

    const total = (inputTokens || 0) + (outputTokens || 0);
    if (inputTokens && outputTokens) {
      return `${inputTokens}→${outputTokens} (${total})`;
    }
    return total.toString();
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-purple-50 via-white to-pink-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm p-4">
        <ModelSelector
          selectedModelId={selectedModelId}
          onModelChange={setSelectedModelId}
        />
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="max-w-4xl mx-auto py-6">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[500px]">
              <div className="text-center space-y-6 max-w-md">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full blur-xl opacity-20 animate-pulse"></div>
                  <div className="relative bg-gradient-to-r from-purple-500 to-pink-500 rounded-full p-4 w-20 h-20 mx-auto flex items-center justify-center">
                    <Sparkles className="h-10 w-10 text-white" />
                  </div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    Hello {session?.user?.name?.split(' ')[0] || 'there'}!
                  </h2>
                  <p className="text-gray-600 text-lg">
                    How can I help you today?
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 mt-8">
                  {[
                    { icon: '📊', title: 'Data Analysis', desc: 'Analyze and visualize your data' },
                    { icon: '💡', title: 'Creative Writing', desc: 'Generate stories and content' },
                    { icon: '🔧', title: 'Code Review', desc: 'Review and improve your code' },
                  ].map((item, index) => (
                    <div
                      key={index}
                      className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-4 hover:bg-white/80 transition-all cursor-pointer group"
                      onClick={() => setMessage(`Help me with ${item.title.toLowerCase()}`)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{item.icon}</span>
                        <div className="text-left">
                          <div className="font-medium text-gray-900 group-hover:text-purple-600 transition-colors">
                            {item.title}
                          </div>
                          <div className="text-sm text-gray-500">{item.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-4 group",
                    msg.role === 'USER' ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === 'ASSISTANT' && (
                    <Avatar className="w-8 h-8 mt-1 ring-2 ring-purple-100">
                      <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={cn(
                      "max-w-[85%] space-y-2",
                      msg.role === 'USER' ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "relative rounded-2xl px-4 py-3 shadow-sm",
                        msg.role === 'USER'
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white ml-auto"
                          : "bg-white border border-gray-200"
                      )}
                    >
                      {msg.role === 'USER' ? (
                        <div className="whitespace-pre-wrap text-white">{msg.content}</div>
                      ) : (
                        <MarkdownMessage
                          content={msg.content}
                          className={cn(
                            "prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700",
                            "prose-code:bg-gray-100 prose-code:text-gray-800"
                          )}
                        />
                      )}

                      {msg.role === 'ASSISTANT' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => copyToClipboard(msg.content, msg.id)}
                            >
                              {copiedId === msg.id ? (
                                <Check className="mr-2 h-4 w-4" />
                              ) : (
                                <Copy className="mr-2 h-4 w-4" />
                              )}
                              Copy
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit3 className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                      <span>{format(new Date(msg.createdAt), 'HH:mm')}</span>

                      {msg.role === 'ASSISTANT' && (
                        <>
                          {msg.model && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {msg.model.provider.displayName}
                            </Badge>
                          )}

                          {(msg.inputTokens || msg.outputTokens) && (
                            <span className="flex items-center gap-1">
                              <span>🔢</span>
                              {formatTokenCount(msg.inputTokens, msg.outputTokens)}
                            </span>
                          )}

                          {msg.cost && (
                            <span className="flex items-center gap-1">
                              <span>💰</span>
                              ${msg.cost.toFixed(6)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {msg.role === 'USER' && (
                    <Avatar className="w-8 h-8 mt-1 ring-2 ring-purple-100">
                      <AvatarImage src={session?.user?.image || ''} />
                      <AvatarFallback className="bg-gray-100">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}

              {/* Streaming Response */}
              {streamingState.isStreaming && (
                <div className="flex gap-4">
                  <Avatar className="w-8 h-8 mt-1 ring-2 ring-purple-100">
                    <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm max-w-[85%]">
                    {streamingState.content ? (
                      <MarkdownMessage
                        content={streamingState.content}
                        className="prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-code:bg-gray-100 prose-code:text-gray-800"
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        </div>
                        <span className="text-sm text-gray-500 ml-2">AI is thinking...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error Display */}
              {streamingState.error && (
                <div className="flex gap-4">
                  <Avatar className="w-8 h-8 mt-1 ring-2 ring-red-100">
                    <AvatarFallback className="bg-red-500 text-white">
                      <AlertCircle className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 shadow-sm max-w-[85%]">
                    <p className="text-red-700 text-sm">
                      <strong>Error:</strong> {streamingState.error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t bg-white/80 backdrop-blur-sm p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={handleMessageChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask something..."
                className="resize-none pr-20 border-gray-200 focus:border-purple-300 focus:ring-purple-200 rounded-xl overflow-hidden"
                style={{
                  minHeight: '60px',
                  maxHeight: '200px',
                  height: '60px' // Initial height
                }}
                disabled={isLoading}
                rows={1}
              />
              <div className="absolute right-2 bottom-2 flex gap-1">
                {isLoading && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={stopGeneration}
                    className="h-8 w-8 p-0 hover:bg-red-50 hover:border-red-200"
                    title="Stop generation"
                  >
                    <Square className="h-3 w-3 text-red-500" />
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={!message.trim() || isLoading}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 rounded-lg h-8 w-8 p-0"
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          </form>
          <div className="text-xs text-gray-500 mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
            {isLoading && (
              <span className="ml-2 text-purple-600">
                • Streaming response in real-time
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}