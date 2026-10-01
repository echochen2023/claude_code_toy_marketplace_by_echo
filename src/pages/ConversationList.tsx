import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import NavigationBar from "@/components/NavigationBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ConversationWithDetails {
  id: string;
  product_id: string;
  seller_id: string;
  buyer_id: string;
  updated_at: string;
  last_message_at: string | null;
  product_name: string;
  first_image_url: string | null;
  seller_name: string;
  buyer_name: string;
  last_message?: string;
}

const Conversations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // Only redirect if we're sure the user isn't authenticated (not during loading)
    if (!loading && !user) {
      navigate('/auth');
      return;
    }

    // Only fetch conversations if we have a user
    if (user) {
      fetchConversations();
    }
  }, [user, navigate, loading]);

  const fetchConversations = async () => {
    if (!user) return;
    
    try {
      // Use the secure RPC to fetch conversations with all details
      const { data: conversationsData, error: conversationsError } = await supabase
        .rpc('get_user_conversations');

      if (conversationsError) throw conversationsError;

      if (!conversationsData || conversationsData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Map the RPC results to our interface
      const processedConversations: ConversationWithDetails[] = conversationsData.map(conv => {
        // Cast to any to access all properties that might not be in the type definition yet
        const convAny = conv as any;
        return {
          id: conv.id,
          product_id: conv.product_id,
          seller_id: conv.seller_id,
          buyer_id: convAny.buyer_id || '', // Access from casted object
          updated_at: conv.updated_at,
          last_message_at: conv.last_message_at,
          product_name: conv.product_name || 'Unknown Product',
          first_image_url: conv.first_image_url,
          seller_name: conv.seller_name || 'Anonymous',
          buyer_name: convAny.buyer_name || 'Anonymous', // Access from casted object
          last_message: conv.last_message
        };
      });

      setConversations(processedConversations);
      
      // Fetch unread counts for each conversation
      await fetchUnreadCounts(processedConversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCounts = async (conversationsList: ConversationWithDetails[]) => {
    if (!user || conversationsList.length === 0) return;

    try {
      const unreadPromises = conversationsList.map(conversation => 
        supabase.rpc('get_unread_count_for_conversation', {
          conv_id: conversation.id
        })
      );

      const unreadResults = await Promise.all(unreadPromises);
      
      const newUnreadCounts: Record<string, number> = {};
      conversationsList.forEach((conversation, index) => {
        const result = unreadResults[index];
        if (!result.error && result.data !== null) {
          newUnreadCounts[conversation.id] = result.data;
        } else {
          newUnreadCounts[conversation.id] = 0;
        }
      });

      setUnreadCounts(newUnreadCounts);
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
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

  const handleConversationClick = (conversationId: string) => {
    navigate(`/conversation/${conversationId}`);
  };

  const handleBackToHome = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#f8f4f1]">
      <NavigationBar />
      
      <div className="px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-orator text-primary text-lg font-medium">Conversations</h1>
          <button 
            className="font-orator text-primary text-sm underline-offset-4 hover:underline min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => console.log('Filter clicked')}
          >
            Filter
          </button>
        </div>

        {/* Conversations List */}
        {loading ? (
          <div className="text-center py-8">
            <p className="font-orator text-primary text-sm">Loading conversations...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-orator text-primary text-sm">No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conversation, index) => (
              <div key={conversation.id}>
                <div 
                  className="flex items-center gap-3 min-h-[64px] cursor-pointer hover:bg-primary/5 rounded-lg p-2 -m-2"
                  onClick={() => handleConversationClick(conversation.id)}
                >
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

                  {/* Conversation Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-orator text-primary text-sm font-medium truncate">
                      {conversation.product_name}
                    </h3>
                    <p className="font-orator text-primary/80 text-xs truncate">
                      {conversation.seller_id === user?.id 
                        ? `Buyer: ${conversation.buyer_name}`
                        : `Seller: ${conversation.seller_name}`
                      }
                    </p>
                  </div>

                  {/* Timestamp and Unread Count */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                    <p className="font-orator text-primary text-xs">
                      {formatTimestamp(conversation.last_message_at || conversation.updated_at)}
                    </p>
                    {unreadCounts[conversation.id] > 0 && (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-medium">
                          {unreadCounts[conversation.id]}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Divider */}
                {index < conversations.length - 1 && (
                  <div className="h-px bg-primary/10 my-3" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Back to Home Button */}
        <div className="flex justify-center mt-8 pb-8">
          <Button
            onClick={handleBackToHome}
            className="bg-primary text-white hover:bg-primary/90 font-orator h-[46px] px-6 rounded-full"
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Conversations;
