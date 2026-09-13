import UpgradeContent from "@/components/UpgradeContent";
import { Suspense } from "react";

export default function UpgradePage() {
  return (
    <main className="flex-1 p-6">
      <div className="max-w-5xl">
        <Suspense fallback={<div>Loading upgrade options...</div>}>
          <UpgradeContent />
        </Suspense>
      </div>
    </main>
  );
}