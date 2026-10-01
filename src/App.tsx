import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PresenceProvider } from "@/contexts/PresenceProvider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import CreateListing from "./pages/CreateListing";
import CreateListingForm from "./pages/CreateListingForm";
import Categories from "./pages/Categories";
import About from "./pages/About";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import ProductDetail from "./pages/ProductDetail";
import Conversations from "./pages/ConversationList";
import ConversationDetail from "./pages/ConversationDetail";
import SavedItems from "./pages/SavedItems";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PresenceProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/" element={<Categories />} />
            <Route path="/create-listing" element={<CreateListing />} />
            <Route path="/create-listing/new" element={<CreateListingForm />} />
            <Route path="/create-listing/edit/:id" element={<CreateListingForm />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/about" element={<About />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/messages" element={<Conversations />} />
            <Route path="/conversation/:conversationId" element={<ConversationDetail />} />
            <Route path="/saved-items" element={<SavedItems />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </PresenceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
