"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  Crown,
  Download,
  Minus,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

const formatLimit = (n: number, unit: string) =>
  n === Infinity ? "Unlimited" : `${n} ${unit}`;

const formatRemaining = (seconds: number) => {
  if (seconds === Infinity) return "Unlimited";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs} sec`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} sec`;
};

export default function SubscriptionsContent() {
  const { user } = useUser();
  const [plans, setPlans] = useState<any>({});
  const [payments, setPayments] = useState<any[]>([]);
  const [limits, setLimits] = useState<any>(null);
  const [watchStatus, setWatchStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [plansRes, paymentsRes, limitsRes, wsRes] = await Promise.all([
          axiosInstance.get("/plans"),
          axiosInstance.get("/payment/list"),
          axiosInstance.get("/download/limits"),
          axiosInstance.get("/video/watchstatus"),
        ]);
        setPlans(plansRes.data || {});
        setPayments(paymentsRes.data || []);
        setLimits(limitsRes.data || null);
        setWatchStatus(wsRes.data || null);
      } catch (error) {
        console.error("Error loading subscriptions:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (!user) {
    return (
      <div className="text-center py-12">
        <Crown className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Your subscriptions</h2>
        <p className="text-gray-600">
          Sign in to view your subscription plan and account benefits.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div>Loading subscription...</div>;
  }

  const currentPlan = user.plan || "free";
  const planInfo = plans[currentPlan];
  const paid =
    currentPlan !== "free" &&
    payments.some((p) => p.status === "paid" && p.plan === currentPlan);

  const featureRows: Array<{
    label: string;
    get: (p: any) => string;
  }> = [
    {
      label: "Price",
      get: (p) => (p.price === 0 ? "Free" : `₹${p.price}/mo`),
    },
    {
      label: "Downloads",
      get: (p) => formatLimit(p.downloadsPerDay, "per day"),
    },
    {
      label: "Watch time",
      get: (p) => formatLimit(p.watchMinutesPerDay, "min per day"),
    },
    {
      label: "Premium videos",
      get: (p) => (p.premiumAccess ? "Unlocked" : "Locked"),
    },
    {
      label: "Ad-free",
      get: (p) => (p.adFree ? "Yes" : "No"),
    },
  ];

  const order = ["free", "bronze", "silver", "gold"];
  const planList = order
    .filter((key) => plans[key])
    .map((key) => ({ key, ...plans[key] }));

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-red-600 to-red-500 rounded-xl p-6 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Crown className="w-5 h-5" />
          <span className="text-sm font-medium uppercase tracking-wide">
            Current plan
          </span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold capitalize">{currentPlan}</h2>
            <p className="text-white/80 text-sm mt-1">
              {planInfo?.tagline || "Get started with YourTube"}
            </p>
            {user.planExpiry && paid && (
              <p className="text-white/80 text-sm mt-1">
                Renews on{" "}
                {new Date(user.planExpiry).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/15`}
            >
              <span className="w-2 h-2 rounded-full bg-green-400" />
              {paid ? "Active" : currentPlan === "free" ? "Free plan" : "Paid"}
            </span>
            {currentPlan !== "gold" && (
              <Link href="/upgrade">
                <Button className="bg-white text-red-600 hover:bg-white/90">
                  Upgrade
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Timer className="w-5 h-5" />
            <p className="text-sm font-medium">Watch time left today</p>
          </div>
          <p className="text-2xl font-bold">
            {watchStatus?.remainingSeconds === undefined
              ? "—"
              : formatRemaining(watchStatus.remainingSeconds)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {watchStatus?.watchMinutesPerDay === Infinity
              ? "Unlimited per day"
              : `${watchStatus?.watchMinutesPerDay} min per day`}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Download className="w-5 h-5" />
            <p className="text-sm font-medium">Downloads left today</p>
          </div>
          <p className="text-2xl font-bold">
            {limits?.remaining === Infinity
              ? "Unlimited"
              : limits?.remaining ?? "—"}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {limits?.usedToday ?? 0} used of{" "}
            {limits?.downloadsPerDay === Infinity
              ? "unlimited"
              : limits?.downloadsPerDay}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <BadgeCheck className="w-5 h-5" />
            <p className="text-sm font-medium">Ad-free viewing</p>
          </div>
          <p
            className={`text-2xl font-bold ${
              watchStatus?.adFree ? "text-green-600" : "text-gray-400"
            }`}
          >
            {watchStatus?.adFree ? "Enabled" : "Not included"}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {watchStatus?.adFree
              ? "Enjoy videos with no ads"
              : "Ads may be shown on the free plan"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Features
              </th>
              {planList.map((plan: any) => (
                <th
                  key={plan.key}
                  className={`px-4 py-3 text-center font-medium ${
                    plan.key === currentPlan ? "text-red-600" : "text-gray-600"
                  }`}
                >
                  <div className="capitalize">{plan.name}</div>
                  <div className="text-xs font-normal text-gray-500">
                    {plan.price === 0 ? "Free" : `₹${plan.price}/mo`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureRows.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <td className="px-4 py-3 text-gray-600">{row.label}</td>
                {planList.map((plan: any) => (
                  <td
                    key={plan.key}
                    className={`px-4 py-3 text-center ${
                      plan.key === currentPlan ? "bg-red-50/50" : ""
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {row.get(plan) === "Locked" ||
                      row.get(plan) === "No" ? (
                        <Minus className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      )}
                      {row.get(plan)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Plan changes apply immediately after a successful payment. Subscriptions
        renew monthly and last until the plan expiry date.{" "}
        <Link href="/upgrade" className="text-blue-600 hover:underline">
          View all plans
        </Link>
      </p>
    </div>
  );
}