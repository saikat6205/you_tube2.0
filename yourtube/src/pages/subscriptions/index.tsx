import SubscriptionsContent from "@/components/SubscriptionsContent";
import { Suspense } from "react";

export default function SubscriptionsPage() {
  return (
    <main className="flex-1 p-6">
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Subscriptions</h1>
        <Suspense fallback={<div>Loading subscriptions...</div>}>
          <SubscriptionsContent />
        </Suspense>
      </div>
    </main>
  );
}