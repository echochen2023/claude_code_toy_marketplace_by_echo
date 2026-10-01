import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import NavigationBar from "@/components/NavigationBar";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useUserSavedProducts } from "@/hooks/useUserSavedProducts";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  created_at: string;
  updated_at: string;
}

const Profile = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Get dynamic activity counts
  const { products: userProducts } = useUserProducts();
  const { products: savedProducts } = useUserSavedProducts();
  const { unreadCount } = useUnreadMessagesCount();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => {
        setUser(session?.user ?? null);
        
        if (!session?.user) {
          navigate("/auth");
        } else {
          // Fetch user profile when authenticated
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        toast({
          title: "Error",
          description: "Failed to load profile information.",
          variant: "destructive",
        });
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Same fallback as get_profile_names().display_name: either part is enough
  const fullName = [profile?.first_name, profile?.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  // Nickname defaults to the full name until the user sets one
  const displayNickname = profile?.nickname || fullName;

  const startEditingNickname = () => {
    setNicknameInput(displayNickname);
    setIsEditingNickname(true);
  };

  const handleSaveNickname = async () => {
    if (!profile) return;
    const trimmed = nicknameInput.trim();
    if (trimmed.length > 50) {
      toast({
        title: "Nickname too long",
        description: "Please use 50 characters or fewer.",
        variant: "destructive",
      });
      return;
    }
    // Empty or same as the full name → store NULL so it keeps following the name
    const newNickname = trimmed && trimmed !== fullName ? trimmed : null;

    try {
      setSavingNickname(true);
      const { error } = await supabase
        .from('profiles')
        .update({ nickname: newNickname })
        .eq('user_id', profile.user_id);

      if (error) {
        console.error('Error updating nickname:', error);
        toast({
          title: "Error",
          description: "Failed to update nickname.",
          variant: "destructive",
        });
        return;
      }

      setProfile({ ...profile, nickname: newNickname });
      setIsEditingNickname(false);
      toast({
        title: "Nickname updated",
        description: "Your nickname has been saved.",
      });
    } finally {
      setSavingNickname(false);
    }
  };

  const handleSignOut = async () => {
    try {
      // Try a client-side only approach first
      // Clear session from memory
      setUser(null);
      setProfile(null);  // Clear profile data
      
      // Clear local storage manually
      for (const key in localStorage) {
        if (key.startsWith('supabase.auth.') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      }
      
      // Try the signOut method without scope parameter
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.log('Sign out API call failed, but local session was cleared:', signOutError);
        // We'll continue even if this fails since we've cleared local storage
      }
      
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
      
      // Navigate after a short delay
      setTimeout(() => {
        window.location.href = import.meta.env.BASE_URL; // Use direct location change instead of navigate
      }, 100);
      
    } catch (error) {
      console.error('Sign out error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background font-orator">
        <NavigationBar />
        
        <div className="flex items-center justify-center pt-20">
          <div className="text-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-orator">
      <NavigationBar />
      
      {/* Page Content */}
      <div className="px-4 py-4">
        {/* Page Title */}
        <h1 className="text-lg font-medium text-foreground mb-3">Account</h1>
        
        {/* Profile Information Card */}
        <div className="bg-card border border-foreground/15 rounded-[14px] p-5 mb-4">
          {/* Card Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium text-foreground">Profile information</h2>
          </div>
          
          {/* Profile Fields */}
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-foreground mb-1">Name</div>
              <div className="text-foreground">
                {fullName || "Unable to fetch data"}
              </div>
            </div>
            
            <div>
              <div className="text-sm font-medium text-foreground mb-1">Nickname</div>
              {isEditingNickname ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveNickname();
                      if (e.key === "Escape") setIsEditingNickname(false);
                    }}
                    maxLength={50}
                    placeholder={fullName}
                    className="max-w-xs"
                    autoFocus
                    disabled={savingNickname}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveNickname}
                    disabled={savingNickname}
                  >
                    {savingNickname ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditingNickname(false)}
                    disabled={savingNickname}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="text-foreground">
                    {displayNickname || "Not set"}
                  </div>
                  <button
                    type="button"
                    onClick={startEditingNickname}
                    className="text-sm text-foreground underline hover:no-underline min-h-[44px] inline-flex items-center"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-medium text-foreground mb-1">E-mail</div>
              <div className="text-foreground">
                {profile?.email || "Unable to fetch data"}
              </div>
            </div>
            
            <div>
              <div className="text-sm font-medium text-foreground mb-1">Password</div>
              <div className="text-foreground">**********</div>
            </div>
          </div>
        </div>
        
        {/* Activity Card */}
        <div className="bg-card border border-foreground/15 rounded-[14px] p-5 mb-8">
          <h2 className="text-base font-medium text-foreground mb-4">Activity</h2>
          
          <div className="space-y-3">
            <div>
              <div className="text-foreground mb-1">You have ({userProducts.length}) listings</div>
              <Link to="/create-listing" className="text-foreground underline hover:no-underline min-h-[44px] min-w-[44px] inline-flex items-center">
                View listings
              </Link>
            </div>
            
            <div>
              <div className="text-foreground mb-1">You have ({unreadCount}) unread messages</div>
              <Link to="/messages" className="text-foreground underline hover:no-underline min-h-[44px] min-w-[44px] inline-flex items-center">
                View messages
              </Link>
            </div>
            
            <div>
              <div className="text-foreground mb-1">You have ({savedProducts.length}) saved products</div>
              <Link to="/saved-items" className="text-foreground underline hover:no-underline min-h-[44px] min-w-[44px] inline-flex items-center">
                View all saved products
              </Link>
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-4 pb-8">
          <Link to="/">
            <Button 
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90 h-[46px] px-8 rounded-[20px] min-h-[44px] min-w-[44px]"
            >
              Return Home
            </Button>
          </Link>
          
          <Button 
            onClick={handleSignOut}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/90 h-[46px] px-8 rounded-[20px] min-h-[44px] min-w-[44px]"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
