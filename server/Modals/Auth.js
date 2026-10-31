import mongoose from "mongoose";

// One entry per trusted browser/device. `deviceId` is a random opaque id created
// in the browser; `userAgentHash` binds that id to the browser that created it so a
// copied deviceId alone is not enough to be trusted.
const trustedDeviceSchema = mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    userAgentHash: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    trustedAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

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
  // Effective theme applied to the UI. Saved on every login and on manual change.
  theme: { type: String, enum: ["light", "dark"], default: "dark" },
  // "auto"  -> recomputed from IST on each login
  // "manual" -> user picked it; never overwritten automatically
  themeSource: { type: String, enum: ["auto", "manual"], default: "auto" },
  trustedDevices: { type: [trustedDeviceSchema], default: [] },
});

export default mongoose.model("user", userschema);