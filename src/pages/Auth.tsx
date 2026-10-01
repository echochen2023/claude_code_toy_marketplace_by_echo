import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

const Auth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "reset">("signin");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check for password reset mode from URL
    if (searchParams.get("mode") === "reset") {
      setAuthMode("reset");
    }

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Redirect authenticated users to home page
        if (session?.user) {
          navigate("/");
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Redirect if already authenticated
      if (session?.user) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  const handleAuthSuccess = () => {
    // Auth state change will handle the redirect
  };

  const handleSwitchToSignUp = () => {
    setAuthMode("signup");
  };

  const handleSwitchToSignIn = () => {
    setAuthMode("signin");
  };

  const handleForgotPassword = () => {
    setAuthMode("reset");
  };

  const handleBackToSignIn = () => {
    setAuthMode("signin");
  };

  // Show reset password form if in reset mode
  if (authMode === "reset") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-[var(--page-padding)]">
        <Card className="w-full max-w-md">
          <CardHeader className="pb-6">
            <CardTitle className="text-center text-xl text-foreground">
              Marketplace
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResetPasswordForm onBack={handleBackToSignIn} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-[var(--page-padding)]">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-6">
          <CardTitle className="text-center text-xl text-foreground">
            Marketplace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={authMode} onValueChange={(value) => setAuthMode(value as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin" className="mt-0">
              <SignInForm
                onSuccess={handleAuthSuccess}
                onSwitchToSignUp={handleSwitchToSignUp}
                onForgotPassword={handleForgotPassword}
              />
            </TabsContent>
            
            <TabsContent value="signup" className="mt-0">
              <SignUpForm
                onSuccess={handleAuthSuccess}
                onSwitchToSignIn={handleSwitchToSignIn}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
