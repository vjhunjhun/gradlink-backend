import User from "../MODEL/user.model.js";
import Post from "../MODEL/post.model.js";
import ChatViolation from "../MODEL/chatViolation.model.js";
import bcrypt from "bcryptjs";
import Message from "../MODEL/message.model.js";
import GroupMessage from "../MODEL/groupMessage.model.js";
import Comment from "../MODEL/comment.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";

export const getViolations = async (req, res) => {
  try {
    const violations = await ChatViolation.find()
      .populate("user", "name email profilePicture role isBanned banCount")
      .sort({ reportedAt: -1 });

    return res.status(200).json({
      success: true,
      violations,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const banUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isBanned = true;
    user.banCount = (user.banCount || 0) + 1;
    await user.save();

    // Mark violations as resolved
    await ChatViolation.updateMany(
      { user: userId, isResolved: false },
      { isResolved: true }
    );

    return res.status(200).json({
      success: true,
      message: "User banned successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isBanned = false;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "User unbanned successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getAlumni = async (req, res) => {
  try {
    const alumni = await User.find({ role: "alumni", isDeleted: false })
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      alumni,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher", isDeleted: false })
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      teachers,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const createTeacher = async (req, res) => {
  try {
    const { name, email, password, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const existingUser = await User.findOne({ email, isDeleted: false });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const teacher = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "teacher",
      isVerified: true,
      isBanned: false,
      department: department || undefined,
    });

    return res.status(201).json({
      success: true,
      message: "Teacher profile created successfully",
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const createAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const existingUser = await User.findOne({ email, isDeleted: false });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      isBanned: false,
    });

    return res.status(201).json({
      success: true,
      message: "Admin profile created successfully",
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(200).json({
        success: true,
        users: [],
      });
    }

    const users = await User.find({
      isDeleted:false,
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    })
      .select("_id name email role profilePicture department batch isBanned banCount")
      .limit(20);

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const changeUserPassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "User ID and new password are required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.id; // ID of the admin performing the deletion
    // Prevent admin from deleting itself
    if (adminId.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
     if (user.isDeleted) {
       return res.status(404).json({
         success: false,
         message: "User already Deleted",
       });
     }

    // Delete user's posts
    await Post.deleteMany({ author: userId });

    // Remove user from followers/following lists
    await User.updateMany(
      { followers: userId },
      { $pull: { followers: userId } }
    );
    await User.updateMany(
      { following: userId },
      { $pull: { following: userId } }
    );

    // Delete user's messages
    
    await Message.deleteMany({
      $or: [{ sender: userId }, { recipient: userId }]
    });

    // Delete user's group messages
    
    await GroupMessage.deleteMany({ senderId: userId });

    // Delete user's violations
    await ChatViolation.deleteMany({ user: userId });

    // Delete user's comments - find and update posts
    await Comment.deleteMany({ author: userId });

    // Soft delete the user - mark as deleted instead of hard delete
    // This allows the email to be reused by new registrations
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.name = "Deleted User";
    user.bio = "";
    user.profilePicture = "";
    await user.save();
    const socketId = getReceiverSocketId(userId);

    if (socketId) {
      io.to(socketId).emit("forceLogout");
    }
    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};