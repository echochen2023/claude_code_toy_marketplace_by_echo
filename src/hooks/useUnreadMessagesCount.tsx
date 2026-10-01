import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useUnreadMessagesCount = () => {
  const { user, loading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUnreadCount = async () => {
    if (!user) {
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Get all user conversations
      const { data: conversations, error: conversationsError } = await supabase
        .rpc('get_user_conversations');

      if (conversationsError) throw conversationsError;

      let totalUnread = 0;

      // Get unread count for each conversation
      if (conversations && conversations.length > 0) {
        const unreadPromises = conversations.map(conversation => 
          supabase.rpc('get_unread_count_for_conversation', {
            conv_id: conversation.id
          })
        );

        const unreadResults = await Promise.all(unreadPromises);
        
        totalUnread = unreadResults.reduce((sum, result) => {
          if (result.error) {
            console.error('Error fetching unread count:', result.error);
            return sum;
          }
          return sum + (result.data || 0);
        }, 0);
      }

      setUnreadCount(totalUnread);
    } catch (error) {
      console.error('Error fetching unread messages count:', error);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchUnreadCount();
    }
  }, [user, authLoading]);

  return { 
    unreadCount, 
    loading: loading || authLoading, 
    refetch: fetchUnreadCount 
  };
};