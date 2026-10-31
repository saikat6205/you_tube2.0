import mongoose from "mongoose";
import users from "../Modals/Auth.js";
import jwt from "jsonwebtoken";
import { issueChallenge, resendChallenge, verifyChallenge, maskEmail, cancelChallenge } from "../utils/otp.js";
import { getClientIp, lookupLocation } from "../utils/geo.js";
import { normalizeDeviceId, hashUserAgent } from "../utils/device.js";
import { resolveThemeFromLoginTime, formatIstTime } from "../utils/theme.js";
import { sendLoginOtpEmail } from "../utils/mailer.js";
import { verifyFirebaseIdToken } from "../utils/firebase.js";
import { findTrustedDevice, mergeTrustedDevice } from "../utils/trust.js";

const signToken = (user) =>
  jwt.sign(
    { id: user._id.toString(), email: user.email },
    process.env.JWT_SECRET || "yourtube_secret_key",
    { expiresIn: "7d" }
  );

// trustedDevices holds device ids and location history, so it is never echoed
// back to a client (the public GET /user/:id endpoint returns the raw document).
const publicUser = (user) => {
  const plain =
    typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete plain.trustedDevices;
  return plain;
};

/**
 * Recompute the automatic theme from the IST login time, but only while the user
 * has not made a manual choice. `themeSource` is what makes a manual pick survive
 * subsequent logins instead of being overwritten here.
 */
const syncTheme = async (user, now = new Date()) => {
  if (user.themeSource === "manual") return user.theme;
  const theme = resolveThemeFromLoginTime(now);
  if (user.theme !== theme) {
    user.theme = theme;
    await user.save();
  }
  return theme;
};

/**
 * A login is trusted only when the same browser id, the same browser fingerprint
 * and the same city/state are all known. A missing/invalid device id is always
 * treated as a new device.
 */

const recordTrustedDevice = async (user, { deviceId, userAgentHash, location }) => {
  if (!deviceId) return;
  user.trustedDevices = mergeTrustedDevice(user.trustedDevices, {
    deviceId,
    userAgentHash,
    location,
  });
  await user.save();
};

export const login = async (req, res) => {
  const { idToken, name, image, deviceId: rawDeviceId } = req.body;

  try {
    // The email must come from a signed Firebase ID token, not from the body.
    let claims;
    try {
      claims = await verifyFirebaseIdToken(idToken);
    } catch (authError) {
      if (authError.code === "AUTH_CONFIG") {
        console.error(
          "Login blocked: FIREBASE_PROJECT_ID is not configured on the server."
        );
        return res
          .status(503)
          .json({ message: "Sign-in is temporarily unavailable." });
      }
      console.warn(`Rejected login: ${authError.message}`);
      return res.status(401).json({
        message: "We could not verify your sign-in. Please sign in again.",
      });
    }

    const email = String(claims.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "A valid email is required" });
    }

    // Match case-insensitively so an older record with different casing is not
    // duplicated into a second account.
    const emailPattern = new RegExp(
      `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );
    let user = await users.findOne({ email: emailPattern });

    if (!user) {
      user = await users.create({
        email,
        name: claims.name || name,
        image: claims.picture || image,
      });
    }

    await syncTheme(user);

    const deviceId = normalizeDeviceId(rawDeviceId);
    const userAgentHash = hashUserAgent(req.headers["user-agent"] || "");
    const ip = getClientIp(req);
    const location = await lookupLocation(ip);

    const trusted = findTrustedDevice(user, { deviceId, userAgentHash, location });

    if (!trusted) {
      const issued = issueChallenge({
        userId: user._id,
        email: user.email,
        deviceId,
        userAgentHash,
        location,
      });

      if (issued.error) {
        const retryAfterSeconds = issued.retryAfterSeconds;
        return res.status(429).json({
          message:
            issued.error === "cooldown"
              ? "Please wait before requesting another verification code."
              : "Too many verification codes requested. Please try again later.",
          reason: issued.error,
          retryAfterSeconds,
        });
      }

      if (!issued.reused) {
        try {
          await sendLoginOtpEmail({
            email: user.email,
            name: user.name,
            code: issued.code,
            city: location.city,
            state: location.state,
          });
        } catch (mailError) {
          console.error("OTP email delivery failed:", mailError.message);
          cancelChallenge(issued.challengeId);
          return res.status(502).json({
            message:
              "We could not send your verification code. Please try again shortly.",
          });
        }
      }

      console.log(
        `OTP required for ${user.email} | unrecognised device/location ${location.city}, ${location.state} at ${formatIstTime()}`
      );

      return res.status(200).json({
        requiresOtp: true,
        challengeId: issued.challengeId,
        destination: maskEmail(user.email),
        city: location.city,
        state: location.state,
      });
    }

    await recordTrustedDevice(user, { deviceId, userAgentHash, location });

    const token = signToken(user);
    return res.status(200).json({
      result: publicUser(user),
      token,
      theme: user.theme,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const verifyotp = async (req, res) => {
  const { challengeId, code } = req.body;

  try {
    if (!challengeId || !code) {
      return res.status(400).json({ message: "Challenge id and code are required" });
    }

    const result = verifyChallenge(challengeId, String(code).trim());
    if (!result.ok) {
      const messages = {
        expired: "This verification code has expired. Please sign in again.",
        tooManyAttempts: "Too many incorrect attempts. Please sign in again.",
        mismatch: "That code is not correct.",
      };
      return res.status(400).json({
        message: messages[result.reason] || "Verification failed",
        reason: result.reason,
        ...(result.attemptsLeft !== undefined
          ? { attemptsLeft: result.attemptsLeft }
          : {}),
      });
    }

    const { entry } = result;
    const user = await users.findById(entry.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await syncTheme(user);
    await recordTrustedDevice(user, {
      deviceId: entry.deviceId,
      userAgentHash: entry.userAgentHash,
      location: entry.location,
    });

    const token = signToken(user);
    console.log(`OTP verified for ${user.email}; device trusted`);
    return res.status(200).json({
      result: publicUser(user),
      token,
      theme: user.theme,
      verified: true,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const resendotp = async (req, res) => {
  const { challengeId } = req.body;
  if (!challengeId) {
    return res.status(400).json({ message: "Challenge id is required" });
  }

  try {
    const result = resendChallenge(challengeId);
    if (result.error) {
      const messages = {
        expired: "This verification request has expired. Please sign in again.",
        cooldown: "Please wait before requesting another verification code.",
        rateLimited: "Too many verification codes requested. Please try again later.",
      };
      return res.status(result.error === "cooldown" ? 429 : 400).json({
        message: messages[result.error] || "Could not resend the code",
        reason: result.error,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    try {
      await sendLoginOtpEmail({
        email: result.email,
        code: result.code,
        city: result.location?.city,
        state: result.location?.state,
      });
    } catch (mailError) {
      console.error("OTP resend failed:", mailError.message);
      cancelChallenge(result.challengeId);
      return res.status(502).json({
        message: "We could not resend your verification code. Please try again shortly.",
      });
    }

    return res.status(200).json({ resent: true, challengeId: result.challengeId });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const settheme = async (req, res) => {
  const { theme } = req.body;

  try {
    if (!["light", "dark"].includes(theme)) {
      return res.status(400).json({ message: "theme must be light or dark" });
    }
    if (!mongoose.Types.ObjectId.isValid(req.userId)) {
      return res.status(404).json({ message: "User not found" });
    }
    const user = await users.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.theme = theme;
    user.themeSource = "manual";
    await user.save();

    return res.status(200).json({ theme: user.theme, themeSource: user.themeSource });
  } catch (error) {
    console.error("Set theme error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getuser = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "User not found" });
  }
  try {
    const user = await users.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json(publicUser(user));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(500).json({ message: "User unavailable..." });
  }
  if (req.userId && req.userId !== _id) {
    return res.status(403).json({ message: "You can only update your own profile" });
  }
  const setfields = { channelname: channelname, description: description };
  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      {
        $set: setfields,
      },
      { new: true }
    );
    return res.status(201).json(publicUser(updatedata));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};