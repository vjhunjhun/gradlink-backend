import User from "../MODEL/user.model.js";
import Notification from "../MODEL/notification.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Post from "../MODEL/post.model.js";
import getDataUri from "../utils/datauri.js";
import cloudinary from "../utils/cloudinary.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { getReceiverSocketId, io } from "../socket/socket.js";
import NepaliDate from "nepali-date-converter";
import { verifyGoogleToken } from "../utils/googleAuth.js";
import { triggerCleanupOnAdminSignin } from "../utils/violationCleanup.js";
export const register = async (req, res) => {
  try {
    const { name, email, password, gender, department, batch, role: requestedRole } = req.body;

    if (!name || !email || !password) {
      return res.status(401).json({
        message: "Something is missing please check",
        success: false,
      });
    }
    if (!email.endsWith("@pcampus.edu.np")) {
      return res.status(400).json({
        message: "Only @pcampus.edu.np emails are allowed",
        success: false,
      });
    }

    // Only students and alumni can register through signup
    // Admin and teacher accounts must be created by admin users
    if (requestedRole && !["student", "alumni"].includes(requestedRole)) {
      return res.status(403).json({
        message: "Only students and alumni can register. Contact admin for other roles.",
        success: false,
      });
    }

    let role = "student";
    const currentYear = 2083;
    const batchYearCode = parseInt(email.substring(0, 3));

    // If requestedRole is explicitly provided and valid, use it
    if (requestedRole && ["student", "alumni"].includes(requestedRole)) {
      role = requestedRole;
    } else {
      // Auto-determine role based on batch year from email
      // Extract first 3 chars (batch code), add 2000 to get year
      if (!isNaN(batchYearCode) && batchYearCode > 0) {
        const batchYear = 2000 + batchYearCode;
        // If batch year is less than (currentYear - 4), assign alumni role
        if (batchYear < currentYear - 4) {
          role = "alumni";
        }
      }
    }

    if (gender && !["male", "female"].includes(gender)) {
      return res.status(400).json({
        message: "Please select a valid gender",
        success: false,
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      const msg = existingUser.isDeleted ? "Your Account is permanently deactivated!" : "Try different email id!";
      return res.status(409).json({
        message: msg,
        success: false,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      gender: gender || null,
      department: department || null,
      batch: batch || null,
      verificationToken: token,
      role,
      isBanned: false,
      verificationTokenExpires: Date.now() + 3600000,
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const verifyLink = `http://localhost:8000/api/v1/user/verify/${token}`;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL,
        to: email,
        subject: "Verify your account",
        html: `<h3>Click below to verify</h3>
               <a href="${verifyLink}">${verifyLink}</a>`,
      });
    } catch (err) {
      console.log("Email failed:", err);
    }

    return res.status(201).json({
      message: "Account created! Please verify your email",
      success: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: error.message || "Error creating account",
      success: false,
    });
  }
};

export const seedAdmin = async (req, res) => {
  try {
    const { secret } = req.body;
    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({
        success: false,
        message: "Invalid secret",
      });
    }

    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return res.status(200).json({
        success: true,
        message: "Admin user already exists",
        admin: existingAdmin,
      });
    }

    const hashedPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || "Admin@123", 10);
    const adminUser = await User.create({
      name: process.env.SEED_ADMIN_NAME || "GradLink Admin",
      email: process.env.SEED_ADMIN_EMAIL || "admin@pcampus.edu.np",
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      isBanned: false,
    });

    return res.status(201).json({
      success: true,
      message: "Admin user seeded",
      admin: adminUser,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired token",
        success: false,
      });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    await user.save();

    return res.status(200).send("Email verified successfully!");
  } catch (error) {
    console.log(error);
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        message: "Something is missing please check",
        success: false,
      });
    }
    let user = await User.findOne({ email });
    // demo admin credential path
    if (email === "demo" && password === "demo") {
      user = await User.findOne({ email: "demo" });
      if (!user) {
        const hashedDemo = await bcrypt.hash("demo", 10);
        user = await User.create({
          name: "Demo Admin",
          email: "demo",
          password: hashedDemo,
          role: "admin",
          isVerified: true,
          isBanned: false,
        });
      }
    }

    if (!user) {
      return res.status(401).json({
        message: "Incorrect email or password",
        success: false,
      });
    }
    if (!user?.isVerified) {
      return res.status(401).json({
        message: "Please verify your email",
        success: false,
      });
    }
    if (user?.isBanned) {
      return res.status(403).json({
        message: "Your account has been banned",
        success: false,
      });
    }
    if (user?.isDeleted) {
      return res.status(403).json({
        message: "Your account has been deleted",
        success: false,
      });
    }
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        message: "Incorrect email or password",
        success: false,
      });
    }

    // Trigger violation cleanup in background if admin is logging in
    if (user.role === "admin") {
      triggerCleanupOnAdminSignin().catch((error) => {
        console.error("[Admin Signin Cleanup Error]", error);
      });
    }

    const token = jwt.sign({ userId: user?._id }, process.env.SECRET_KEY, {
      expiresIn: "1d",
    });
    const populatedPosts = await Post.find({
      _id: { $in: user.posts },
    }).populate({ path: "author", select: "name profilePicture role" });
    user = {
      _id: user?._id,
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      posts: populatedPosts,
      bookmarks:user.bookmarks,
      role: user.role,
      isBanned: user.isBanned,
      isDeleted:user.isDeleted,
    };
    return res
      .cookie("token", token, {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        maxAge: 1 * 24 * 60 * 60 * 1000,
      })
      .json({
        message: `Welcome back ${user.name}`,
        success: true,
        user,
      });
  } catch (error) {
    console.log(error);
  }
};

export const googleSignup = async (req, res) => {
  try {
    const { token, name, department, batch } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token is required",
      });
    }

    // Verify the Google token
    const googleUser = await verifyGoogleToken(token);
    const { email, picture } = googleUser;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      if (existingUser.isDeleted) {
        return res.status(409).json({
          success: false,
          message: "Your Account is permanently deactivated!",
        });
      }
      
      return res.status(409).json({
        success: false,
        message: "User with this email already exists. Please login instead.",
      });
    }

    // Determine role based on email batch code
    let role = "student";
    const currentYear = 2083;
    const batchYearCode = parseInt(email.substring(0, 3));

    if (!isNaN(batchYearCode) && batchYearCode > 0) {
      const batchYear = 2000 + batchYearCode;
      if (batchYear < currentYear - 4) {
        role = "alumni";
      }
    }

    // Create new user with Google data
    const newUser = await User.create({
      name: name || googleUser.name,
      email,
      password: crypto.randomBytes(16).toString("hex"), // Random password since they use Google
      profilePicture: picture || "",
      role,
      department: department || null,
      batch: batch || null,
      isVerified: true, // Google verified users
      isBanned: false,
    });

    const token_jwt = jwt.sign({ userId: newUser._id }, process.env.SECRET_KEY, {
      expiresIn: "1d",
    });

    return res
      .cookie("token", token_jwt, {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        maxAge: 1 * 24 * 60 * 60 * 1000,
      })
      .json({
        success: true,
        message: "Account created with Google successfully",
        user: newUser,
      });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      success: false,
      message: error.message || "Google signup failed",
    });
  }
};

export const googleSignin = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token is required",
      });
    }

    // Verify the Google token
    const googleUser = await verifyGoogleToken(token);
    const { email } = googleUser;

    // Find user by email
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Please sign up first.",
      });
    }

    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: "Please verify your email",
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: "Your account has been banned",
      });
    }

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deleted",
      });
    }

    // Trigger violation cleanup in background if admin is logging in
    if (user.role === "admin") {
      triggerCleanupOnAdminSignin().catch((error) => {
        console.error("[Admin Google Signin Cleanup Error]", error);
      });
    }

    const token_jwt = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, {
      expiresIn: "1d",
    });

    return res
      .cookie("token", token_jwt, {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        maxAge: 1 * 24 * 60 * 60 * 1000,
      })
      .json({
        success: true,
        message: `Welcome back ${user.name}`,
        user,
      });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      success: false,
      message: error.message || "Google signin failed",
    });
  }
};

export const logout = async (_, res) => {
  try {
    return res.cookie("token", "", { maxAge: 0 }).json({
      message: "Logged out successfully,",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    let user = await User.findById(userId).select("-password");
    await user.populate({
      path: "posts",
      createdAt: -1,
    });
     await user.populate({
       path: "bookmarks",
     });
    return res.status(200).json({
      user,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getNotifications = async (req, res) => {
   try {
     const userId = req.params.id;
     if (req.id !== userId) {
       return res.status(401).json({
         success: false,
         message:"unauthorized",
       });
     }
     const notifications = await Notification.find({
       receiverId: userId,
       seen: false,
     }).populate({
       path: "userDetails",
       select: "name profilePicture",
     });
     return res.status(200).json({
       success: true,
       notifications,
     });
   } catch (error) {
     console.log(error);
   }
}
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.id.toString() !== userId.toString()) {
      return res.status(401).json({
        success: false,
        message: "unauthorized",
      });
    }
    await Notification.deleteMany({ receiverId: userId });
    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const editProfile = async (req, res) => {
  try {
    const userId = req.id;
    const { bio, gender } = req.body;
    const profilePicture = req.file;

    // Validation: Check if gender is provided and is valid
    if (gender && !["", "male", "female"].includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid gender",
      });
    }

    let cloudResponse;
    if (profilePicture) {
      const fileUri = getDataUri(profilePicture);
      cloudResponse = await cloudinary.uploader.upload(fileUri);
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        success: false,
      });
    }
    if (bio !== undefined && bio !== null) user.bio = bio;
    if (gender !== undefined && gender !== null && gender !== "") user.gender = gender;
    if (profilePicture) user.profilePicture = cloudResponse.secure_url;
    await user.save();
    return res.status(200).json({
      message: "Profile updated",
      success: true,
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating profile",
    });
  }
};

// export const getSuggestedUsers = async (req, res) => {
//   try {
//         const loggedUser = await User.findById(req.id).select("-password");
//         const followingUsers = await User.find({
//             _id: { $in: loggedUser.following }
//         }).select("following");
//         const suggestedUserIds = followingUsers.flatMap(
//   (user) => user.following
//         );
//      const uniqueSuggestedIds = [
//   ...new Set(suggestedUserIds.map(id => id.toString()))
// ].filter(
//   id =>
//     id !== loggedUser?._id.toString() &&
//     !loggedUser.following.map(fid => fid.toString()).includes(id)
//       );
//       let len = uniqueSuggestedIds.length;
//       if (len!=0 && len < 5) {
//         let extraSuggestedIds = await User.find({ _id: { $nin: uniqueSuggestedIds } }, {}, { limit: 5 - len });
//         console.log(extraSuggestedIds);
//       }
//         let suggestedUsers = await User.find({
//           _id: { $in: uniqueSuggestedIds },
//         }).select("-password");
//       if (!suggestedUsers.length) {
//         const followerUsers = await User.find({
//           _id: { $in: loggedUser.followers },
//         }).select("followers");
//         const followerUsersId = followerUsers.flatMap(
//           (user) => user.followers
//         );
//        const followOrFollowingUsers = [...suggestedUserIds, ...followerUsersId];
//         const uniquefollowOrFollowingUsers = [...new Set(followOrFollowingUsers.map(id => id.toString()))];
//             suggestedUsers = await User.find({
//           _id: { $nin: [...uniquefollowOrFollowingUsers,loggedUser?._id] }
//             }).select("-password");  
//          }
//          return res.status(200).json({
//            success: true,
//            suggestedUsers,
//            message:"bhai kya ho rha",
//          });
//     } catch (error) {
//         console.log(error);
//           return res.status(500).json({
//             success: false,
//             message: "Server error",
//           });
//     }  
// };

export const getSuggestedUsers = async (req, res) => {
  try {
    const LIMIT = 5;

    // 1. Logged-in user
    const loggedUser = await User.findById(req.id).select(
      "following followers",
    );

    if (!loggedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userId = loggedUser._id.toString();
    const followingIds = loggedUser.following.map((id) => id.toString());
    const followerIds = loggedUser.followers.map((id) => id.toString());

    // 2. Friends of friends
    const followingUsers = await User.find({
      _id: { $in: loggedUser.following },isBanned:false,isDeleted:false,role:{$ne:"admin"},
    }).select("following");

    let suggestedIds = followingUsers.flatMap((user) =>
      user.following.map((id) => id.toString()),
    );

    // 3. Clean them
    let uniqueIds = [...new Set(suggestedIds)].filter(
      (id) =>
        id !== userId &&
        !followingIds.includes(id) &&
        !followerIds.includes(id),
    );

    // 4. If less than LIMIT → add random users (excluding followers + following)
    if (uniqueIds.length < LIMIT) {
      const excludeIds = [
        userId,
        ...followingIds,
        ...followerIds,
        ...uniqueIds,
      ];

      const extraUsers = await User.find({
        _id: { $nin: excludeIds },
        isVerified: true,
        isBanned: false,
        isDeleted: false,
        role: { $ne: "admin" },
      })
        .select("_id")
        .limit(LIMIT - uniqueIds.length);

      const extraIds = extraUsers.map((user) => user._id.toString());

      uniqueIds = [...uniqueIds, ...extraIds];
    }

    // 5. Fetch final users
    let suggestedUsers = await User.find({
      _id: { $in: uniqueIds.slice(0, LIMIT) },
    }).select("-password");

    // If user is alumni and we don't have enough suggestions, add teachers
    if (loggedUser.role === "alumni" && suggestedUsers.length < LIMIT) {
      const teacherIds = await User.find({
        role: "teacher",
        _id: { $nin: [...uniqueIds, userId, ...followingIds, ...followerIds] },
        isVerified: true,
        isBanned: false,
        isDeleted: false,
        role: { $ne: "admin" },
      })
        .select("_id")
        .limit(LIMIT - suggestedUsers.length);

      if (teacherIds.length > 0) {
        const additionalTeachers = await User.find({
          _id: { $in: teacherIds.map(t => t._id) },
        }).select("-password");

        suggestedUsers = [...suggestedUsers, ...additionalTeachers];
      }
    }

    return res.status(200).json({
      success: true,
      suggestedUsers: suggestedUsers.slice(0, LIMIT),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const followOrUnfollow = async (req, res) => {
  try {
    const followedBy = req.id;
    const followedTo = req.params.id;
    if (followedBy === followedTo) {
      return res.status(400).json({
        message: "Can't proceed with that request",
        success: false,
      });
    };
    const user = await User.findById(followedBy);
    const targetUser = await User.findById(followedTo);
    if (!user || !targetUser) {
      return res.status(400).json({
        message: "User not found!",
        success: false,
      });
    };
    if (user.isDeleted || targetUser.isBanned || targetUser.isDeleted || user.isBanned) {
       return res.status(400).json({
         message: "User not found!",
         success: false,
       });
    }
    if (targetUser.role === "admin") {
      return res.status(200).json({
        message: "cannot follow admin",
        success: false,
      });
    }
    const isFollowing = user.following.includes(followedTo);
    if (isFollowing) {
      //we need to unfollow
      await Promise.all([
        User.updateOne(
          { _id: followedBy },
          { $pull: { following: followedTo } },
        ),
        User.updateOne(
          { _id: followedTo },
          { $pull: { followers: followedBy } },
        ),
      ]);
      const notification = {
        type: "unfollow",
        userId: followedBy,
        message: "unfollowed you!",
        read: false,
      };
      await Notification.deleteOne({
        userId: followedBy,
        receiverId: followedTo,
      });
      const unFollowToSocketId = getReceiverSocketId(followedTo);
      io.to(unFollowToSocketId).emit("notification", notification);
      return res.status(200).json({
        message: "Unfollowed successfully!",
        success: true,
      });
    } else {
      //need to follow
      await Promise.all([
        User.updateOne(
          { _id: followedBy },
          { $push: { following: followedTo } },
        ),
        User.updateOne(
          { _id: followedTo },
          { $push: { followers: followedBy } },
        ),
      ]);
      const notification = {
        type: "follow",
        userId: followedBy,
        message: "followed you!",
        read: false,
      };
      const toSaveNotify = await Notification.create({ ...notification, userDetails: followedBy, receiverId: followedTo });
      await toSaveNotify.save();
      const followToSocketId = getReceiverSocketId(followedTo);
      const user = await User.findById(followedBy).select(
        "name profilePicture",
      );
      io.to(followToSocketId).emit("notification", {
        ...notification,
        userDetails: user,
      });
      return res.status(200).json({
        message: "Followed successfully!",
        success: true,
      });
    }
  } catch (error) {
    console.log(error);
  }
};

export const getChatUsers = async (req, res) => {
  try {
    const userId = req.id;

    const user = await User.findById(userId)
      .select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // If user is a teacher, return all users except themselves
    if (user.role === "teacher") {
      const allUsers = await User.find({ _id: { $ne: userId },isBanned:false,isDeleted:false,role:{$ne:"admin"} })
        .select("name profilePicture role")
        .limit(100);
      
      return res.status(200).json({
        success: true,
        users: allUsers,
      });
    }

    // For non-teachers, return only followers and following
    await user.populate("followers", "name profilePicture role");
    await user.populate("following", "name profilePicture role");

    const usersMap = new Map();

    user.followers.forEach((u) => {
      if (!u.isBanned && !u.isDeleted) {
        usersMap.set(u._id.toString(), u);
      }
    });

    user.following.forEach((u) => {
      if (!u.isBanned && !u.isDeleted) {
        usersMap.set(u._id.toString(), u);
      }
    });

    const chatUsers = Array.from(usersMap.values());

    return res.status(200).json({
      success: true,
      users: chatUsers,
    });
  } catch (error) {
    console.log(error);
  }
};

export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(200).json({ success: true, users: [] });
    }

    const users = await User.find({
      name: { $regex: query, $options: "i" },
      isBanned: false,
      isDeleted: false,
      role: { $ne: "admin" },
    })
      .select("name profilePicture role")
      .limit(10);

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getFollowers = async (req, res) => {
  const user = await User.findById(req.params.id).populate(
    "followers",
    "name profilePicture role",
  );

  res.json({
    success: true,
    users: user.followers,
  });
};

export const getFollowing = async (req, res) => {
  const user = await User.findById(req.params.id).populate(
    "following",
    "name profilePicture role",
  );

  res.json({
    success: true,
    users: user.following,
  });
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
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
