import mongoose from "mongoose";

const chatViolationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    violationType: {
      type: String,
      enum: ["banned_word", "spam", "harassment"],
      default: "banned_word",
    },
    reportedAt: {
      type: Date,
      default: Date.now,
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const ChatViolation = mongoose.model("ChatViolation", chatViolationSchema);
export default ChatViolation;