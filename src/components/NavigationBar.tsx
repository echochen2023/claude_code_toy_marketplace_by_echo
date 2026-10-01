import { Menu, User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation, useNavigate } from "react-router-dom";
import HamburgerMenu from "./HamburgerMenu";
import marketplaceLogo from "@/assets/marketplace-logo.png";
import { useAuth } from "@/hooks/useAuth";

const NavigationBar = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleMessagesClick = () => {
    if (location.pathname.startsWith('/messages')) {
      // If already on messages page/subpage, refresh the page
      window.location.reload();
    } else {
      // Navigate to messages page
      navigate('/messages');
    }
  };

  const handleProfileClick = () => {
    console.log('handleProfileClick called - location.pathname: ', location.pathname);
    console.log('handleProfileClick called - user: ', user);
    const targetPath = user ? '/profile' : '/auth';
    console.log('handleProfileClick called - targetPath: ', targetPath);
    if (location.pathname === targetPath) {
      console.log('handleProfileClick called - reload');
      // If already on target page, refresh
      window.location.reload();
    } else {
      console.log('handleProfileClick called - navigate');
      // Navigate to target page
      navigate(targetPath);
    }
  };

  const handleLogoClick = () => {
    if (location.pathname === '/') {
      // If already on home page, refresh
      window.location.reload();
    } else {
      // Navigate to home page
      navigate('/');
    }
  };

  return (
    <>
      <header className="h-16 flex items-center justify-between px-4 bg-background font-orator">
        {/* Left: Hamburger Menu */}
        <HamburgerMenu>
          <Button variant="ghost" size="icon" className="p-0 w-6 h-6">
            <Menu className="w-6 h-6 text-primary" />
          </Button>
        </HamburgerMenu>

        {/* Center: Logo */}
        <div className="flex-1 flex justify-center">
          <button onClick={handleLogoClick} className="cursor-pointer hover:opacity-80 transition-opacity">
            <img
              src={marketplaceLogo}
              alt="Marketplace Logo"
              className="h-8 w-auto object-contain"
            />
          </button>
        </div>

        {/* Right: Profile & Chat Icons */}
        <div className="flex items-center gap-3">
          {/* Profile Avatar */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="p-0 cursor-pointer hover:bg-primary/10" 
            onClick={handleProfileClick}
          >
            <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
          </Button>

          {/* Chat/Mail Icon */}
          <Button variant="ghost" size="icon" className="p-0 w-6 h-6" onClick={handleMessagesClick}>
            <Mail className="w-6 h-6 text-primary" />
          </Button>
        </div>
      </header>

      {/* Thin Divider */}
      <div className="w-full h-px bg-primary/12" />
    </>
  );
};

export default NavigationBar;
