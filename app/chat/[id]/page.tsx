'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { EnhancedChatInterface } from '@/components/chat/enhanced-chat-interface';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';

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

export default function ConversationPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (session && params.id) {
      fetchConversation();
    }
  }, [session, params.id]);

  const fetchConversation = async () => {
    try {
      const response = await fetch(`/api/conversations/${params.id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: 'Error',
            description: 'Conversation not found',
            variant: 'destructive',
          });
          router.push('/chat');
          return;
        }
        throw new Error('Failed to fetch conversation');
      }

      const data = await response.json();
      setConversation(data);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversation',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const handleNewChat = () => {
    router.push('/chat');
    setSidebarOpen(false);
  };

  const handleNewMessage = () => {
    // Refresh conversation data after new message
    fetchConversation();
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-shrink-0">
        <ChatSidebar 
          currentConversationId={params.id}
          onNewChat={handleNewChat} 
        />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <ChatSidebar 
            currentConversationId={params.id}
            onNewChat={handleNewChat} 
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b bg-white">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>
          <h1 className="font-semibold truncate bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            {conversation?.title || 'AI Chat'}
          </h1>
          <div className="w-8" /> {/* Spacer */}
        </div>

        <EnhancedChatInterface 
          conversation={conversation || undefined}
          onNewMessage={handleNewMessage}
        />
      </div>
    </div>
  );
}