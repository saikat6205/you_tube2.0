"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Crown, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { formatDistanceToNow } from "date-fns";

const loadRazorpayScript = (): Promise<any> => {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) {
      resolve((window as any).Razorpay);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve((window as any).Razorpay);
    script.onerror = () => resolve(null);
    document.body.appendChild(script);
  });
};

const formatDownloads = (n: number) =>
  n === Infinity ? "Unlimited" : `${n} / day`;

const formatWatch = (n: number) =>
  n === Infinity ? "Unlimited" : `${n} min / day`;

export default function UpgradeContent() {
  const { user, login } = useUser();
  const [plans, setPlans] = useState<any>({});
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [mockCheckout, setMockCheckout] = useState<any>(null);
  const [verifyingMock, setVerifyingMock] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [plansRes, paymentsRes] = await Promise.all([
          axiosInstance.get("/plans"),
          axiosInstance.get("/payment/list"),
        ]);
        setPlans(plansRes.data || {});
        setPayments(paymentsRes.data || []);
      } catch (error) {
        console.error("Error loading upgrade page:", error);
        setPlans({});
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const upgradeSuccess = (verifyRes: any, planKey: string) => {
    login(verifyRes.data.user);
    toast.success(`Upgraded to ${plans[planKey]?.name || planKey} plan!`);
    setPayments((prev) => [
      verifyRes.data.payment,
      ...prev.filter((p: any) => p._id !== verifyRes.data.payment._id),
    ]);
  };

  const handleUpgrade = async (planKey: string) => {
    if (!user) {
      toast.error("Please sign in before upgrading");
      return;
    }
    setProcessing(planKey);
    try {
      const orderRes = await axiosInstance.post("/payment/order", {
        plan: planKey,
      });
      const orderData = orderRes.data;

      if (orderData.mock) {
        setMockCheckout({
          planKey,
          orderId: orderData.orderId,
          paymentId: orderData.paymentId,
          amount: orderData.amount,
          currency: orderData.currency,
        });
        return;
      }

      const Razorpay = await loadRazorpayScript();
      if (!Razorpay) {
        toast.error("Could not load Razorpay checkout. Check your connection.");
        return;
      }
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "YourTube",
        description: `${plans[planKey]?.name || planKey} subscription`,
        order_id: orderData.orderId,
        prefill: {
          name: user.name || user.email,
          email: user.email,
        },
        theme: { color: "#ff0000" },
        handler: async (response: any) => {
          try {
            const verifyRes = await axiosInstance.post("/payment/verify", {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            upgradeSuccess(verifyRes, planKey);
          } catch (error: any) {
            toast.error(
              error?.response?.data?.message ||
                "Payment verification failed. Please contact support."
            );
          }
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment cancelled");
          },
        },
      };
      const rzp = new Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        toast.error(
          response?.error?.description || "Payment failed. Please try again."
        );
      });
      rzp.open();
    } catch (error: any) {
      console.error("Upgrade error:", error);
      toast.error(
        error?.response?.data?.message ||
          "Failed to start checkout. Please try again."
      );
    } finally {
      setProcessing(null);
    }
  };

  const handleMockPay = async () => {
    if (!mockCheckout) return;
    setVerifyingMock(true);
    try {
      const verifyRes = await axiosInstance.post("/payment/verify", {
        razorpayOrderId: mockCheckout.orderId,
        razorpayPaymentId: `mock_pay_${Date.now()}`,
        razorpaySignature: "mock_signature",
      });
      upgradeSuccess(verifyRes, mockCheckout.planKey);
      setMockCheckout(null);
    } catch (error: any) {
      console.error("Mock verify error:", error);
      toast.error(
        error?.response?.data?.message ||
          "Payment verification failed. Please try again."
      );
    } finally {
      setVerifyingMock(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <Crown className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          Upgrade your YourTube experience
        </h2>
        <p className="text-gray-600">
          Sign in to choose a plan and unlock premium features.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div>Loading plans...</div>;
  }

  const order = ["free", "bronze", "silver", "gold"];
  const planList = order
    .filter((key) => plans[key])
    .map((key) => ({ key, ...plans[key] }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Upgrade your plan</h1>
        <p className="text-gray-600">
          Choose a plan that fits how you watch. Your current plan:{" "}
          <span className="font-medium uppercase">{user.plan || "free"}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {planList.map((plan: any) => {
          const isCurrent = (user.plan || "free") === plan.key;
          const isFree = plan.key === "free";
          const features = [
            `Downloads: ${formatDownloads(plan.downloadsPerDay)}`,
            `Watch time: ${formatWatch(plan.watchMinutesPerDay)}`,
            plan.premiumAccess
              ? "Unlock premium videos"
              : "Limited access to premium videos",
            plan.adFree ? "Ad-free viewing" : "Ads may be shown",
          ];
          return (
            <div
              key={plan.key}
              className={`border rounded-xl p-5 flex flex-col ${
                isCurrent ? "border-red-600 ring-2 ring-red-600/30" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold capitalize">{plan.name}</h3>
                {isCurrent && (
                  <span className="text-xs font-medium bg-red-600 text-white px-2 py-0.5 rounded-full">
                    Current
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold mb-1">
                ₹{plan.price}
                <span className="text-sm font-normal text-gray-500">
                  /month
                </span>
              </p>
              <p className="text-sm text-gray-500 mb-4">{plan.tagline}</p>
              <ul className="space-y-1.5 mb-6 flex-1">
                {features.map((feature: string) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              {isFree ? (
                <Button variant="outline" disabled>
                  Free forever
                </Button>
              ) : isCurrent ? (
                <Button variant="outline" disabled>
                  Active
                </Button>
              ) : (
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => handleUpgrade(plan.key)}
                  disabled={!!processing}
                >
                  {processing === plan.key ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>Upgrade to {plan.name}</>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {payments.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-3">Payment history</h2>
          <div className="space-y-2">
            {payments.map((payment: any) => (
              <div
                key={payment._id}
                className="flex items-center justify-between border rounded-lg px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium capitalize">{payment.plan} plan</p>
                  <p className="text-gray-600">
                    {payment.razorpayPaymentId
                      ? `Payment ${payment.razorpayPaymentId}`
                      : `Order ${payment.razorpayOrderId}`}{" "}
                    • {payment.currency} {payment.amount}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      payment.status === "paid"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {payment.status}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDistanceToNow(new Date(payment.createdAt))} ago
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Payments are processed securely via Razorpay test mode. After a
        successful payment your plan updates instantly and an invoice is emailed
        to you.{" "}
        <Link href="/downloads" className="text-blue-600 hover:underline">
          Manage downloads
        </Link>
      </p>

      {mockCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold">Demo checkout (mock)</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Payment gateway not configured — this is a simulated Razorpay
              payment for testing the flow.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm mb-5">
              <p className="flex justify-between">
                <span className="text-gray-600">Plan</span>
                <span className="font-medium capitalize">
                  {plans[mockCheckout.planKey]?.name}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-600">Amount</span>
                <span className="font-medium">
                  {mockCheckout.currency} {mockCheckout.amount / 100}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-600">Order</span>
                <span className="font-medium text-xs">{mockCheckout.orderId}</span>
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setMockCheckout(null)}
                disabled={verifyingMock}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={handleMockPay}
                disabled={verifyingMock}
              >
                {verifyingMock ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>Pay {mockCheckout.currency} {mockCheckout.amount / 100}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}