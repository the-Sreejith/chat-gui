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
  Sparkles
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

export function EnhancedChatInterface({ conversation, onNewMessage }: EnhancedChatInterfaceProps) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>(conversation?.messages || []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isTyping, setIsTyping] = useState(false);
  
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
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setMessage('');
    setIsLoading(true);
    setIsTyping(true);

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      id: 'temp-user-' + Date.now(),
      role: 'USER',
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          conversationId: conversation?.id,
          modelId: selectedModelId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();
      
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
          data.message
        ];
      });

      // If this is a new conversation, redirect to it
      if (!conversation?.id && data.conversationId) {
        router.push(`/chat/${data.conversationId}`);
      }

      onNewMessage?.();
      
    } catch (error: any) {
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsTyping(false);
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
        <div className="max-w-4xl mx-auto">
          <ModelSelector
            selectedModelId={selectedModelId}
            onModelChange={setSelectedModelId}
          />
        </div>
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
              
              {isTyping && (
                <div className="flex gap-4">
                  <Avatar className="w-8 h-8 mt-1 ring-2 ring-purple-100">
                    <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-1">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      </div>
                      <span className="text-sm text-gray-500 ml-2">AI is thinking...</span>
                    </div>
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
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask something..."
                className="min-h-[60px] max-h-[200px] resize-none pr-12 border-gray-200 focus:border-purple-300 focus:ring-purple-200 rounded-xl"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!message.trim() || isLoading}
                className="absolute right-2 bottom-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 rounded-lg"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
          <div className="text-xs text-gray-500 mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
}