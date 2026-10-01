import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UserPresence {
  user_id: string;
  online_at: string;
  username?: string;
}

interface PresenceContextType {
  onlineUsers: Map<string, UserPresence>;
  isUserOnline: (userId: string) => boolean;
  getUserPresence: (userId: string) => UserPresence | null;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

interface PresenceProviderProps {
  children: ReactNode;
}

export const PresenceProvider: React.FC<PresenceProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Map<string, UserPresence>>(new Map());
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) {
      // Clean up when user logs out
      if (channel) {
        supabase.removeChannel(channel);
        setChannel(null);
      }
      setOnlineUsers(new Map());
      return;
    }

    // Create presence channel
    const presenceChannel = supabase.channel('global-presence');

    // Listen to presence events
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const newState = presenceChannel.presenceState();
        const userMap = new Map<string, UserPresence>();
        
        Object.entries(newState).forEach(([userId, presences]) => {
          if (presences && presences.length > 0 && typeof presences[0] === 'object') {
            const presence = presences[0] as any;
            if (presence.user_id) {
              userMap.set(userId, presence as UserPresence);
            }
          }
        });
        
        setOnlineUsers(userMap);
        // console.log('Presence sync:', Array.from(userMap.keys()));
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        // console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        // console.log('User left:', key, leftPresences);
      });

    // Subscribe to the channel
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track current user's presence
        const userStatus: UserPresence = {
          user_id: user.id,
          online_at: new Date().toISOString(),
          username: user.email?.split('@')[0] || 'Anonymous'
        };

        await presenceChannel.track(userStatus);
        // console.log('Started tracking presence for user:', user.id);
      }
    });

    setChannel(presenceChannel);

    // Clean up on unmount or user change
    return () => {
      if (presenceChannel) {
        presenceChannel.untrack();
        supabase.removeChannel(presenceChannel);
      }
    };
  }, [user]);

  // Handle browser close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (channel && user) {
        channel.untrack();
      }
    };

    const handleVisibilityChange = () => {
      if (!user || !channel) return;

      if (document.visibilityState === 'hidden') {
        // User switched tabs or minimized browser
        setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            channel.untrack();
          }
        }, 5000); // 5 second delay before going offline
      } else {
        // User came back
        const userStatus: UserPresence = {
          user_id: user.id,
          online_at: new Date().toISOString(),
          username: user.email?.split('@')[0] || 'Anonymous'
        };
        channel.track(userStatus);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [channel, user]);

  const isUserOnline = (userId: string): boolean => {
    // Iterate through all values in onlineUsers and check if any have matching user_id
    for (const presence of onlineUsers.values()) {
      if (presence.user_id === userId) {
        return true;
      }
    }
    return false;
  };

  const getUserPresence = (userId: string): UserPresence | null => {
    // Find the presence object where user_id matches the provided userId
    for (const presence of onlineUsers.values()) {
      if (presence.user_id === userId) {
        return presence;
      }
    }
    return null;
  };

  const value: PresenceContextType = {
    onlineUsers,
    isUserOnline,
    getUserPresence,
  };

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresence = (): PresenceContextType => {
  const context = useContext(PresenceContext);
  if (context === undefined) {
    throw new Error('usePresence must be used within a PresenceProvider');
  }
  return context;
};
