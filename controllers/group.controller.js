import Group from "../MODEL/group.model.js";
import GroupMessage from "../MODEL/groupMessage.model.js";
import User from "../MODEL/user.model.js";
import ChatViolation from "../MODEL/chatViolation.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { containsBannedWord } from "../utils/bannedWords.js";


export const createGroup = async (req, res) => {
  try {
    const createdBy = req.id;
    const { name, description } = req.body;

  
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Group name is required",
      });
    }

    
    const user = await User.findById(createdBy);
    if (user?.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can create groups",
      });
    }

    const group = await Group.create({
      name: name.trim(),
      description: description?.trim() || "",
      createdBy,
      members: [createdBy],
      admins: [createdBy],
    });

    const populatedGroup = await group.populate([
      { path: "createdBy", select: "name profilePicture role" },
      { path: "members", select: "name profilePicture role" },
    ]);

    io.emit("group_created", populatedGroup);

    return res.status(201).json({
      success: true,
      message: "Group created successfully",
      group: populatedGroup,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error creating group",
    });
  }
};


export const addMembersToGroup = async (req, res) => {
  try {
    const userId = req.id;
    const { groupId } = req.params;
    const { memberIds } = req.body;

   
    if (!groupId || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Group ID and member IDs are required",
      });
    }

    const group = await Group.findById(groupId).populate([
      { path: "members", select: "name profilePicture role" },
      { path: "admins", select: "name profilePicture" },
    ]);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

   
    const isAdmin = group.admins.some((admin) => admin._id.toString() === userId.toString());
    const isCreator = group.createdBy.toString() === userId.toString();

    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "Only admins can add members",
      });
    }

    
    const currentMemberIds = group.members.map((m) => m._id.toString());
    const newMembers = memberIds.filter((id) => !currentMemberIds.includes(id.toString()));

    if (newMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All members are already in the group",
      });
    }

    group.members = [...group.members, ...newMembers];
    await group.save();

    const populatedGroup = await group.populate([
      { path: "members", select: "name profilePicture role" },
      { path: "createdBy", select: "name profilePicture role" },
    ]);

    io.to(`group_${groupId}`).emit("group_members_added", populatedGroup);

    return res.status(200).json({
      success: true,
      message: "Members added successfully",
      group: populatedGroup,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error adding members",
    });
  }
};


export const getUserGroups = async (req, res) => {
  try {
    const userId = req.id;

    const groups = await Group.find({
      members: userId,
    })
      .populate({
        path: "createdBy",
        select: "name profilePicture role",
      })
      .populate({
        path: "members",
        select: "name profilePicture role",
      })
      .populate({
        path: "messages",
        options: { limit: 1, sort: { createdAt: -1 } },
        populate: {
          path: "senderId",
          select: "name profilePicture",
        },
      })
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      groups,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching groups",
    });
  }
};


export const getGroupMessages = async (req, res) => {
  try {
    const userId = req.id;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

   
    const isMember = group.members.some((member) => member.toString() === userId.toString());

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    const messages = await GroupMessage.find({ groupId })
      .populate({
        path: "senderId",
        select: "name profilePicture role",
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      messages: messages.reverse(),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching messages",
    });
  }
};


export const sendGroupMessage = async (req, res) => {
  try {
    const senderId = req.id;
    const { groupId } = req.params;
    const { message: messageText } = req.body;

   
    if (!groupId || !messageText || !messageText.trim()) {
      return res.status(400).json({
        success: false,
        message: "Group ID and message are required",
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    
    const isMember = group.members.some((member) => member.toString() === senderId.toString());

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    // Check for banned words in group message
    if (containsBannedWord(messageText)) {
      await ChatViolation.create({
        user: senderId,
        message: messageText,
        violationType: "banned_word",
        isResolved: false,
      });
      
      return res.status(400).json({
        success: false,
        message: "Your message contains inappropriate content and has been reported",
      });
    }

    const newMessage = await GroupMessage.create({
      groupId,
      senderId,
      message: messageText.trim(),
      seenBy: [senderId],
    });

    await newMessage.populate({
      path: "senderId",
      select: "name profilePicture role",
    });

    group.messages.push(newMessage._id);
    await group.save();

    
    io.to(`group_${groupId}`).emit("groupMessage", newMessage.toObject());

    return res.status(201).json({
      success: true,
      message: "Message sent",
      newMessage,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error sending message",
    });
  }
};


export const removeMemberFromGroup = async (req, res) => {
  try {
    const userId = req.id;
    const { groupId, memberId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    
    const isAdmin = group.admins.some((admin) => admin.toString() === userId.toString());
    const isCreator = group.createdBy.toString() === userId.toString();

    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "Only admins can remove members",
      });
    }

   
    if (memberId === group.createdBy.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove group creator",
      });
    }

    group.members = group.members.filter((member) => member.toString() !== memberId);
    group.admins = group.admins.filter((admin) => admin.toString() !== memberId);

    await group.save();

    const populatedGroup = await group.populate([
      { path: "members", select: "name profilePicture role" },
      { path: "createdBy", select: "name profilePicture role" },
    ]);

    io.to(`group_${groupId}`).emit("groupMember_removed", {
      groupId,
      memberId,
      group: populatedGroup,
    });

    return res.status(200).json({
      success: true,
      message: "Member removed from group",
      group: populatedGroup,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error removing member",
    });
  }
};


export const deleteGroup = async (req, res) => {
  try {
    const userId = req.id;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    if (group.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only creator can delete group",
      });
    }

   
    await GroupMessage.deleteMany({ groupId });

    await Group.findByIdAndDelete(groupId);

    io.to(`group_${groupId}`).emit("group_deleted", { groupId });

    return res.status(200).json({
      success: true,
      message: "Group deleted successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error deleting group",
    });
  }
};
