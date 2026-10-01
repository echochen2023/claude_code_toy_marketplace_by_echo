import NavigationBar from "@/components/NavigationBar";
import { Button } from "@/components/ui/button";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />

      <main className="px-[var(--page-padding)] py-6">
        <div className="max-w-md mx-auto">
          <h1 className="text-display font-medium text-foreground mb-4">
            About Marketplace
          </h1>
          <p className="text-body text-foreground mb-4">
            Marketplace is your trusted platform for buying and selling authentic pre-owned products.
          </p>
          <p className="text-body text-foreground mb-6">
            We connect sellers with buyers in a safe, secure environment where quality and authenticity are guaranteed.
          </p>
          <Button
            variant="destructive"
            onClick={() => {
              throw new Error("Sentry test error from About page");
            }}
          >
            Trigger test error
          </Button>
        </div>
      </main>
    </div>
  );
};

export default About;