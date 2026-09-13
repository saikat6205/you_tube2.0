import mongoose from "mongoose";
const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  plan: { type: String, default: "free" },
  watchDate: { type: String, default: "" },
  watchSecondsUsed: { type: Number, default: 0 },
  planExpiry: { type: Date },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
