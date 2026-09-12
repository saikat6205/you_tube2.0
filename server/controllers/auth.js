import mongoose from "mongoose";
import users from "../Modals/Auth.js";
import jwt from "jsonwebtoken";
import { PLAN_NAMES } from "../config/plans.js";

const signToken = (user) =>
  jwt.sign(
    { id: user._id.toString(), email: user.email },
    process.env.JWT_SECRET || "yourtube_secret_key",
    { expiresIn: "7d" }
  );

export const login = async (req, res) => {
  const { email, name, image } = req.body;

  try {
    let user = await users.findOne({ email });

    if (!user) {
      user = await users.create({ email, name, image });
    }
    const token = signToken(user);
    return res.status(200).json({ result: user, token });
  } catch (error) {
    console.error("Login error:", error);
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
    return res.status(200).json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description, plan } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(500).json({ message: "User unavailable..." });
  }
  if (req.userId && req.userId !== _id) {
    return res.status(403).json({ message: "You can only update your own profile" });
  }
  const setfields = { channelname: channelname, description: description };
  if (plan && PLAN_NAMES.includes(plan)) {
    setfields.plan = plan;
  }
  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      {
        $set: setfields,
      },
      { new: true }
    );
    return res.status(201).json(updatedata);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};