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
  Check
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  tokens?: number;
  cost?: number;
  provider?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

interface ChatInterfaceProps {
  conversation?: Conversation;
  onNewMessage?: () => void;
}

export function ChatInterface({ conversation, onNewMessage }: ChatInterfaceProps) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>(conversation?.messages || []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
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

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="max-w-4xl mx-auto py-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center space-y-4">
                <Bot className="h-12 w-12 mx-auto text-gray-400" />
                <div className="space-y-2">
                  <h3 className="text-xl font-medium">Start a conversation</h3>
                  <p className="text-gray-500">
                    Ask me anything! I'm powered by advanced AI models.
                  </p>
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
                    <Avatar className="w-8 h-8 mt-1">
                      <AvatarFallback className="bg-blue-500 text-white">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  
                  <div
                    className={cn(
                      "max-w-[80%] space-y-2",
                      msg.role === 'USER' ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "px-4 py-3 rounded-lg prose prose-sm max-w-none",
                        msg.role === 'USER'
                          ? "bg-blue-500 text-white ml-auto"
                          : "bg-gray-100 border"
                      )}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{format(new Date(msg.createdAt), 'HH:mm')}</span>
                      
                      {msg.role === 'ASSISTANT' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                            onClick={() => copyToClipboard(msg.content, msg.id)}
                          >
                            {copiedId === msg.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                          
                          {msg.provider && (
                            <Badge variant="secondary" className="text-xs">
                              {msg.provider}
                            </Badge>
                          )}
                          
                          {msg.tokens && (
                            <span>{msg.tokens} tokens</span>
                          )}
                          
                          {msg.cost && (
                            <span>${msg.cost.toFixed(6)}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  {msg.role === 'USER' && (
                    <Avatar className="w-8 h-8 mt-1">
                      <AvatarImage src={session?.user?.image || ''} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-4">
                  <Avatar className="w-8 h-8 mt-1">
                    <AvatarFallback className="bg-blue-500 text-white">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-gray-100 border rounded-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t bg-white p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                className="min-h-[60px] max-h-[200px] resize-none pr-12"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!message.trim() || isLoading}
                className="absolute right-2 bottom-2"
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