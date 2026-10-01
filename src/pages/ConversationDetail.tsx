import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Mail, Image as ImageIcon, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePresence } from "@/contexts/PresenceProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_read?: boolean;
  read_at?: string | null;
}

interface ConversationDetails {
  id: string;
  product_id: string;
  seller_id: string;
  buyer_id: string;
  product_name: string;
  price: number;
  first_image_url: string | null;
  seller_name: string;
  buyer_name: string;
}

const ConversationDetail = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isUserOnline } = usePresence();
  const { toast } = useToast();
  
  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const initialScrollDoneRef = useRef(false);
  const readMarkedRef = useRef<Set<string>>(new Set());
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const [messagesVisible, setMessagesVisible] = useState(false);
  const [conversationEntryTimestamp, setConversationEntryTimestamp] = useState<string | null>(null);

  useEffect(() => {
    // Reset scroll state and visibility when conversation changes
    initialScrollDoneRef.current = false;
    setMessagesVisible(false);
    
    // Store conversation entry timestamp for this user and conversation
    if (user && conversationId) {
      const timestamp = new Date().toISOString();
      const key = `conversation_entry_${user.id}_${conversationId}`;
      localStorage.setItem(key, timestamp);
      setConversationEntryTimestamp(timestamp);
    }
    
    // Only redirect if we're sure the user isn't authenticated (not during loading)
    if (!loading && !user) {
      navigate('/auth');
      return;
    }
    
    // Only fetch data if we have a user and conversation ID
    if (user && conversationId) {
      fetchConversationDetails();
      fetchMessages();
    }
  }, [user, conversationId, navigate, loading]);

  // Real-time message subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const raw = payload.new as any;
          const isFromMe = raw.sender_id === user?.id;
          const newMessage: Message = {
            id: raw.id,
            sender_id: raw.sender_id,
            body: raw.body,
            created_at: raw.created_at,
            is_read: isFromMe,
            read_at: isFromMe ? new Date().toISOString() : null,
          };
          setMessages(prev => {
            const exists = prev.some(msg => msg.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage].sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
          
          // Auto-scroll for all new messages (both from me and other users)
          setTimeout(() => {
            const messagesContainer = document.querySelector('.overflow-y-auto');
            if (messagesContainer) {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  };

  const scrollToFirstUnread = () => {
    if (!user || messages.length === 0) {
      scrollToBottom();
      return;
    }
    
    const idx = messages.findIndex(m => m.sender_id !== user.id && !m.is_read);
    if (idx >= 0) {
      const messageId = messages[idx].id;
      
      // Wait for DOM elements to be available with retry mechanism
      const attemptScroll = (retryCount = 0) => {
        const el = messageRefs.current[messageId];
        
        if (el) {
          // Element found, scroll to it
          el.scrollIntoView({ behavior: "instant", block: "center" });
        } else if (retryCount < 5) {
          // Element not found, retry after a short delay
          setTimeout(() => attemptScroll(retryCount + 1), 100);
        } else {
          // Fallback to scrolling to bottom after max retries
          console.warn('Could not find message element for scrolling, falling back to bottom');
          scrollToBottom();
        }
      };
      
      attemptScroll();
    } else {
      // No unread messages, scroll to bottom
      scrollToBottom();
    }
  };

  useEffect(() => {
    if (!initialScrollDoneRef.current && !loading && messages.length > 0) {
      // Wait for DOM elements to render before attempting scroll
      setTimeout(() => {
        scrollToFirstUnread();
        initialScrollDoneRef.current = true;
        // Show messages after scroll positioning is complete
        setTimeout(() => setMessagesVisible(true), 50);
      }, 150); // Increased delay to ensure DOM is ready
    }
  }, [loading, messages]);

  // Track the first unread message for persistent indicator
  // Only consider messages that arrived before the user entered this conversation
  useEffect(() => {
    if (!user || messages.length === 0 || !conversationEntryTimestamp || loading) {
      return;
    }
    
    // Only set the first unread message ID if we don't already have one
    // This ensures it stays visible until user leaves conversation
    if (!firstUnreadMessageId) {
      const entryTimestamp = new Date(conversationEntryTimestamp).getTime();
      const firstUnread = messages.find(m => {
        const messageTimestamp = new Date(m.created_at).getTime();
        return m.sender_id !== user.id && 
               !m.is_read && 
               messageTimestamp < entryTimestamp;
      });
      if (firstUnread) {
        setFirstUnreadMessageId(firstUnread.id);
        console.log('Set persistent unread indicator for message:', firstUnread.id, 'created at:', firstUnread.created_at);
      }
    }
  }, [messages, user, firstUnreadMessageId, conversationEntryTimestamp, loading]);

  // Reset indicator when conversation changes
  useEffect(() => {
    setFirstUnreadMessageId(null);
  }, [conversationId]);

  const fetchConversationDetails = async () => {
    if (!conversationId || !user) return;

    try {
      const { data, error } = await (supabase as any).rpc('get_conversation_details', {
        conv_id: conversationId,
      });
      if (error) throw error;

      if (!data || data.length === 0) {
        setConversation(null);
        return;
      }

      const conversationData = Array.isArray(data) ? data[0] : data;
      
      setConversation({
        id: conversationData.id,
        product_id: conversationData.product_id,
        seller_id: conversationData.seller_id,
        buyer_id: conversationData.buyer_id,
        product_name: conversationData.product_name || 'Unknown Product',
        price: Number(conversationData.price) || 0,
        first_image_url: conversationData.first_image_url || null,
        seller_name: conversationData.seller_name || 'Anonymous',
        buyer_name: conversationData.buyer_name || 'Anonymous',
      });
    } catch (error) {
      console.error('Error fetching conversation details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversation details',
        variant: 'destructive',
      });
    }
  };

  const fetchMessages = async () => {
    if (!conversationId) return;

    try {
      const { data, error } = await (supabase as any).rpc('get_conversation_messages_with_read_status', {
        conv_id: conversationId,
      });
      if (error) throw error;

      const mapped = ((data as any[]) || []).map((m) => ({
        id: m.id,
        sender_id: m.sender_id,
        body: m.body,
        created_at: m.created_at,
        is_read: !!m.is_read,
        read_at: m.read_at ?? null,
      })) as Message[];

      setMessages(mapped);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markMessageRead = async (messageId: string) => {
    if (!messageId) return;
    if (readMarkedRef.current.has(messageId)) return;
    readMarkedRef.current.add(messageId);
    try {
      const { error } = await (supabase as any).rpc('mark_message_read', { msg_id: messageId });
      if (error) throw error;
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_read: true, read_at: new Date().toISOString() } : m));
    } catch (e) {
      console.error('Failed to mark message read', e);
    }
  };

  useEffect(() => {
    if (!user) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          const messageId = el.dataset.messageId;
          const senderId = el.dataset.sender;
          const isReadAttr = el.getAttribute('data-is-read');
          const isRead = isReadAttr === 'true';
          if (messageId && senderId !== user.id && !isRead) {
            markMessageRead(messageId);
            // update attribute to avoid re-trigger
            el.setAttribute('data-is-read', 'true');
          }
        }
      });
    }, { threshold: 0.6 });

    messages.forEach(m => {
      if (m.sender_id !== user.id && !m.is_read) {
        const el = messageRefs.current[m.id];
        if (el) observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [messages, user]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !conversationId || !user) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          body: newMessage.trim()
        });

      if (error) throw error;

      setNewMessage("");
      
      // Auto-scroll to bottom after sending message
      setTimeout(() => {
        const messagesContainer = document.querySelector('.overflow-y-auto');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }, 100);
      
      // No need to fetchMessages() - realtime subscription will handle it
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return 'Today';
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const shouldShowDateSeparator = (currentIndex: number) => {
    if (currentIndex === 0) return true;
    
    const currentDate = new Date(messages[currentIndex].created_at).toDateString();
    const prevDate = new Date(messages[currentIndex - 1].created_at).toDateString();
    
    return currentDate !== prevDate;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f4f1] flex items-center justify-center">
        <p className="font-orator text-primary text-sm">Loading conversation...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen bg-[#f8f4f1] flex items-center justify-center">
        <p className="font-orator text-primary text-sm">Conversation not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f4f1] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 h-16 px-4 flex items-center justify-between border-b border-primary/10 bg-[#f8f4f1]">
        <div className="flex items-center gap-3">
          {/* Product Thumbnail */}
          <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-primary/10">
            {conversation.first_image_url ? (
              <img
                src={conversation.first_image_url}
                alt={conversation.product_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary text-xs font-orator">?</span>
              </div>
            )}
          </div>
          
          {/* Product Info */}
          <div>
            <h1 className="font-orator text-primary text-sm font-medium">
              {conversation.product_name}
            </h1>
            <p className="font-orator text-primary text-xs">
              ${conversation.price.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <p className="font-orator text-primary/80 text-xs">
                {user?.id === conversation.seller_id 
                  ? `Buyer: ${conversation.buyer_name}`
                  : `Seller: ${conversation.seller_name}`
                }
              </p>
              <div 
                className={`w-2 h-2 rounded-full ${
                  isUserOnline(user?.id === conversation.seller_id 
                    ? conversation.buyer_id 
                    : conversation.seller_id) 
                    ? 'bg-green-500' 
                    : 'bg-gray-400'
                }`}
                title={isUserOnline(user?.id === conversation.seller_id 
                  ? conversation.buyer_id 
                  : conversation.seller_id) 
                  ? 'Online' 
                  : 'Offline'
                }
              />
            </div>
          </div>
        </div>

        {/* Back Button */}
        <button
          onClick={() => navigate('/messages')}
          className="w-6 h-6 flex items-center justify-center text-primary hover:text-primary/80"
        >
          <Mail size={24} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messagesVisible ? (
          <>
            {messages.map((message, index) => {
              // Show indicator above the first unread message that arrived before user entered conversation
              // Once set, keep showing until user leaves conversation (don't check read status again)
              const shouldShowUnreadIndicator = firstUnreadMessageId === message.id;

              return (
                <div key={message.id}>
                  {/* Date Separator */}
                  {shouldShowDateSeparator(index) && (
                    <div className="text-center my-4">
                      <span className="font-orator text-primary/70 text-xs px-3 py-1 bg-primary/5 rounded-full">
                        {formatDate(message.created_at)}
                      </span>
                    </div>
                  )}

                  {/* Unread Message Indicator */}
                  {shouldShowUnreadIndicator && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 border-t border-dashed border-orange-400"></div>
                      <span className="font-orator text-orange-400 text-xs px-2">
                        unread message below
                      </span>
                      <div className="flex-1 border-t border-dashed border-orange-400"></div>
                    </div>
                  )}
                  
                  {/* Message Bubble */}
                  <div
                    ref={(el) => { messageRefs.current[message.id] = el; }}
                    data-message-id={message.id}
                    data-sender={message.sender_id}
                    data-is-read={(message.is_read ? 'true' : 'false')}
                    className={`flex mb-2 ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>

                    <div className={`flex flex-col max-w-[75%] ${message.sender_id === user?.id ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`px-4 py-2 rounded-2xl font-orator text-sm ${
                          message.sender_id === user?.id
                            ? 'bg-[rgb(60,164,199)] text-white border border-[rgb(60,164,199)]/25 rounded-tr-none'
                            : 'bg-white text-primary border border-primary/10 rounded-tl-none'
                        }`}
                      >
                        {message.body}
                      </div>
                      <p 
                        className={`font-orator text-primary/70 text-xs mt-1 ${
                          message.sender_id === user?.id ? 'text-right pr-2' : 'text-left pl-2'
                        }`}
                      >
                        {formatTimestamp(message.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          // Render invisible messages for proper DOM structure and scroll positioning
          <>
            {messages.map((message, index) => {
              // Show indicator above the first unread message that arrived before user entered conversation
              // Once set, keep showing until user leaves conversation (don't check read status again)
              const shouldShowUnreadIndicator = firstUnreadMessageId === message.id;

              return (
                <div key={message.id} style={{ visibility: 'hidden' }}>
                  {/* Date Separator */}
                  {shouldShowDateSeparator(index) && (
                    <div className="text-center my-4">
                      <span className="font-orator text-primary/70 text-xs px-3 py-1 bg-primary/5 rounded-full">
                        {formatDate(message.created_at)}
                      </span>
                    </div>
                  )}

                  {/* Unread Message Indicator */}
                  {shouldShowUnreadIndicator && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 border-t border-dashed border-orange-400"></div>
                      <span className="font-orator text-orange-400 text-xs px-2">
                        unread message below
                      </span>
                      <div className="flex-1 border-t border-dashed border-orange-400"></div>
                    </div>
                  )}
                  
                  {/* Message Bubble */}
                  <div
                    ref={(el) => { messageRefs.current[message.id] = el; }}
                    data-message-id={message.id}
                    data-sender={message.sender_id}
                    data-is-read={(message.is_read ? 'true' : 'false')}
                    className={`flex mb-2 ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>

                    <div className={`flex flex-col max-w-[75%] ${message.sender_id === user?.id ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`px-4 py-2 rounded-2xl font-orator text-sm ${
                          message.sender_id === user?.id
                            ? 'bg-[rgb(60,164,199)] text-white border border-[rgb(60,164,199)]/25 rounded-tr-none'
                            : 'bg-white text-primary border border-primary/10 rounded-tl-none'
                        }`}
                      >
                        {message.body}
                      </div>
                      <p 
                        className={`font-orator text-primary/70 text-xs mt-1 ${
                          message.sender_id === user?.id ? 'text-right pr-2' : 'text-left pl-2'
                        }`}
                      >
                        {formatTimestamp(message.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Composer */}
      <div className="p-4 border-t border-primary/10">
        <div className="flex items-center gap-3">
          {/* Photo Button */}
          <button className="w-11 h-11 flex items-center justify-center text-primary hover:text-primary/80 bg-primary/5 rounded-full">
            <ImageIcon size={20} />
          </button>

          {/* Message Input */}
          <div className="flex-1">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Aa"
              className="h-11 rounded-full border-primary/25 bg-background font-orator text-sm placeholder:text-primary/60 focus-visible:ring-primary/50"
            />
          </div>

          {/* Send Button */}
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            className="bg-primary text-white hover:bg-primary/90 font-orator h-11 px-6 rounded-full disabled:opacity-50 min-w-[68px]"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConversationDetail;