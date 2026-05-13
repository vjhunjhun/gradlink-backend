//for chatting
import  Conversation  from "../MODEL/conversation.model.js";
import  Message  from "../MODEL/message.model.js";
import User from "../MODEL/user.model.js";
import ChatViolation from "../MODEL/chatViolation.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { containsBannedWord } from "../utils/bannedWords.js";
export const sendMessage = async (req, res) => {
  try {
    const senderId = req.id;
    const receiverId = req.params.id;
    const { textMessage:message } = req.body;

    if (!senderId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required for sending messages",
      });
    }

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: "Receiver ID is required",
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message text is required",
      });
    }

    // Check for banned words
    if (containsBannedWord(message)) {
      await ChatViolation.create({
        user: senderId,
        message: message,
        violationType: "banned_word",
        isResolved: false,
      });
      
      return res.status(400).json({
        success: false,
        message: "Your message contains inappropriate content and has been reported",
      });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
      });
    }
    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
    });
    if (newMessage) {
      conversation.messages.push(newMessage?._id);
    }
    await Promise.all([conversation.save(), newMessage.save()]);
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }
    return res.status(201).json({
      success: true,
      newMessage,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getMessage = async (req, res) => {
  try {
    const senderId = req.id;
    const receiverId = req.params.id;
    const conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    }).populate("messages");
      if (!conversation) {
          return res.status(200).json({ messages: [], success: true });
      };
    return res.status(200).json({
      success: true,
      messages: conversation?.messages || [],
    });
  } catch (error) {
    console.log(error);
  }
};
