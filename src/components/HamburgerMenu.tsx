import { useState } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface HamburgerMenuProps {
  children: React.ReactNode;
}

const menuItems = [
  {
    title: "I want to sell",
    href: "/create-listing",
  },
  {
    title: "I want to buy",
    href: "/categories",
  },
  {
    title: "My Saved Items",
    href: "/saved-items",
  },
  {
    title: "About Marketplace",
    href: "/about",
  },
];

const HamburgerMenu = ({ children }: HamburgerMenuProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-full h-full p-0 bg-background border-none [&>button]:hidden"
        aria-describedby="menu-description"
      >
        {/* Header */}
        <SheetHeader className="h-14 flex flex-row items-center justify-between px-[var(--page-padding)] border-none">
          <SheetTitle className="text-display text-foreground font-medium">
            Menu
          </SheetTitle>
          <Button
            variant="ghost"
            size="icon" 
            onClick={() => setOpen(false)}
            className="p-0 w-11 h-11 hover:bg-transparent"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-foreground" />
          </Button>
        </SheetHeader>

        {/* Menu Items */}
        <div className="px-[var(--page-padding)] pt-6">
          <nav role="navigation">
            {menuItems.map((item, index) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className="block py-3 min-h-[44px] text-body text-foreground font-medium hover:underline focus:outline-none focus:underline transition-all duration-200"
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>

        <span id="menu-description" className="sr-only">
          Main navigation menu with links to sell items, browse categories, view saved items, and learn about the marketplace
        </span>
      </SheetContent>
    </Sheet>
  );
};

export default HamburgerMenu;