import express from "express";
import {
  createOrder,
  verifyPayment,
  getPayments,
} from "../controllers/payment.js";
import auth from "../middleware/auth.js";

const routes = express.Router();
routes.post("/order", auth, createOrder);
routes.post("/verify", auth, verifyPayment);
routes.get("/list", auth, getPayments);
export default routes;