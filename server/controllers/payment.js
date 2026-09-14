import Razorpay from "razorpay";
import crypto from "crypto";
import payment from "../Modals/payment.js";
import users from "../Modals/Auth.js";
import { getPlan, PLAN_NAMES } from "../config/plans.js";
import { sendPaymentEmail } from "../utils/mailer.js";

const isMock = () => process.env.MOCK_PAYMENTS === "true";

const getRazorpayInstance = () =>
  new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "",
  });

export const createOrder = async (req, res) => {
  const userId = req.userId;
  const { plan } = req.body;
  try {
    if (!PLAN_NAMES.includes(plan) || plan === "free") {
      return res.status(400).json({ message: "Invalid plan for upgrade" });
    }
    const mockMode = isMock();
    if (
      !mockMode &&
      (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
    ) {
      return res.status(503).json({
        message:
          "Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or enable MOCK_PAYMENTS=true for demo mode.",
      });
    }
    const planInfo = getPlan(plan);
    const user = await users.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    let order;
    if (mockMode) {
      order = {
        id: `mock_order_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        amount: planInfo.price * 100,
        currency: planInfo.currency,
      };
    } else {
      order = await getRazorpayInstance().orders.create({
        amount: planInfo.price * 100,
        currency: planInfo.currency,
        receipt: `receipt_${userId}_${plan}_${Date.now()}`,
        notes: { plan, userid: userId.toString() },
      });
    }
    const record = await payment.create({
      userid: userId,
      email: user.email,
      plan,
      amount: planInfo.price,
      currency: planInfo.currency,
      razorpayOrderId: order.id,
      status: "created",
    });
    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || "mock_key",
      paymentId: record._id,
      mock: mockMode,
    });
  } catch (error) {
    console.error("createOrder error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const verifyPayment = async (req, res) => {
  const userId = req.userId;
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  try {
    const mockMode = isMock();
    if (!mockMode && !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ message: "Payment gateway not configured" });
    }
    const record = await payment.findOne({
      razorpayOrderId,
      userid: userId,
    });
    if (!record) {
      return res.status(404).json({ message: "Payment record not found" });
    }
    if (record.status === "paid") {
      return res
        .status(200)
        .json({ message: "Payment already verified", payment: record });
    }
    if (!mockMode) {
      const body = `${razorpayOrderId}|${razorpayPaymentId}`;
      const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");
      if (expected !== razorpaySignature) {
        record.status = "failed";
        await record.save();
        return res.status(400).json({ message: "Payment verification failed" });
      }
    }
    record.razorpayPaymentId =
      razorpayPaymentId || `mock_pay_${Date.now()}`;
    record.razorpaySignature = razorpaySignature || "mock_signature";
    record.status = "paid";
    await record.save();
    const now = new Date();
    const planExpiry = new Date(now);
    planExpiry.setMonth(planExpiry.getMonth() + 1);
    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { plan: record.plan, planExpiry },
      { new: true }
    );
    try {
      await sendPaymentEmail({
        email: record.email,
        name: updatedUser?.name,
        plan: record.plan,
        amount: record.amount,
        currency: record.currency,
        paymentId: record.razorpayPaymentId,
        orderId: razorpayOrderId,
        paymentDate: now,
        subscriptionStart: now,
        subscriptionEnd: planExpiry,
      });
    } catch (mailErr) {
      console.error("Email send error:", mailErr);
    }
    return res.status(200).json({
      message: "Payment verified successfully",
      payment: record,
      user: updatedUser,
    });
  } catch (error) {
    console.error("verifyPayment error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getPayments = async (req, res) => {
  const userId = req.userId;
  try {
    const payments = await payment
      .find({ userid: userId })
      .sort({ createdAt: -1 });
    return res.status(200).json(payments);
  } catch (error) {
    console.error("getPayments error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};