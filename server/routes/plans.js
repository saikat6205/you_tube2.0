import express from "express";
import { PLANS } from "../config/plans.js";

const routes = express.Router();

routes.get("/", (req, res) => {
  res.status(200).json(PLANS);
});

export default routes;