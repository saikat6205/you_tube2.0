import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import dns from "node:dns";
import http from "node:http";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import { Server } from "socket.io";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import dislikeroutes from "./routes/dislike.js";
import watchlaterroutes from "./routes/watchlater.js";
import downloadroutes from "./routes/download.js";
import historyrroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import paymentroutes from "./routes/payment.js";
import plansroutes from "./routes/plans.js";
import partyroutes from "./routes/party.js";
import { attachPartySocket } from "./socket/party.js";
dotenv.config();
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 1e6,
});
import path from "path";
app.use(cors());
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.use("/uploads", express.static(path.join("uploads")));
app.get("/", (req, res) => {
  res.send("You tube backend is working");
});
app.use(bodyParser.json());
app.use("/user", userroutes);
app.use("/video", videoroutes);
app.use("/like", likeroutes);
app.use("/dislike", dislikeroutes);
app.use("/watch", watchlaterroutes);
app.use("/download", downloadroutes);
app.use("/history", historyrroutes);
app.use("/comment", commentroutes);
app.use("/payment", paymentroutes);
app.use("/plans", plansroutes);
app.use("/party", partyroutes);
attachPartySocket(io);
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});

const DBURL =
  process.env.DB_URL ||
  `${process.env.MONGODB_URI}/${process.env.MONGODB_DATABASE || "yourtube"}`;
mongoose
  .connect(DBURL)
  .then(() => {
    console.log("Mongodb connected");
  })
  .catch((error) => {
    console.log(error);
  });
