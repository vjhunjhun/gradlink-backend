import { Server } from "socket.io";
import express from "express";
import http from "http";
const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["get", "post"],
  },
});

const userSocketMap = {};
const groupMembers = {}; // Track members in each group

export const getReceiverSocketId = (receiverId) => userSocketMap[receiverId];

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  if (userId) {
    userSocketMap[userId] = socket.id;
    console.log(`user connected`, userId, "socket id", socket.id);
  }
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Handle group room management
  socket.on("join_group", ({ groupId }) => {
    if (groupId) {
      socket.join(`group_${groupId}`);
      
      // Track members in group
      if (!groupMembers[groupId]) {
        groupMembers[groupId] = [];
      }
      if (!groupMembers[groupId].includes(userId)) {
        groupMembers[groupId].push(userId);
      }
      
      console.log(`User ${userId} joined group ${groupId}`);
      
      // Notify group members that this user is now online
      io.to(`group_${groupId}`).emit("groupMemberOnline", {
        groupId,
        userId,
        onlineMembers: groupMembers[groupId],
      });
    }
  });

  socket.on("leave_group", ({ groupId }) => {
    if (groupId) {
      socket.leave(`group_${groupId}`);
      
      // Remove from group members tracking
      if (groupMembers[groupId]) {
        groupMembers[groupId] = groupMembers[groupId].filter(id => id !== userId);
        if (groupMembers[groupId].length === 0) {
          delete groupMembers[groupId];
        }
      }
      
      console.log(`User ${userId} left group ${groupId}`);
      
      // Notify group members that this user is offline
      io.to(`group_${groupId}`).emit("groupMemberOffline", {
        groupId,
        userId,
        onlineMembers: groupMembers[groupId] || [],
      });
    }
  });
 

  // Typing indicator for group chats
  socket.on("groupTyping", ({ groupId, userId, isTyping }) => {
    if (groupId) {
      socket.to(`group_${groupId}`).emit("userTyping", {
        groupId,
        userId,
        isTyping,
      });
    }
  });

  // Mark message as read
  socket.on("messageRead", ({ groupId, messageId }) => {
    if (groupId) {
      io.to(`group_${groupId}`).emit("messageReadReceipt", {
        groupId,
        messageId,
        readBy: userId,
      });
    }
  });

  socket.on("disconnect", () => {
    if (userId) {
      console.log(`user disconnected`, userId);
      delete userSocketMap[userId];
      
      // Remove from all groups
      for (const groupId in groupMembers) {
        if (groupMembers[groupId].includes(userId)) {
          groupMembers[groupId] = groupMembers[groupId].filter(id => id !== userId);
          io.to(`group_${groupId}`).emit("groupMemberOffline", {
            groupId,
            userId,
            onlineMembers: groupMembers[groupId] || [],
          });
          
          if (groupMembers[groupId].length === 0) {
            delete groupMembers[groupId];
          }
        }
      }
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { app, server, io };
