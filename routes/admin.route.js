import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import User from "../MODEL/user.model.js";
import { getViolations, banUser, unbanUser, getAlumni, getTeachers, createTeacher, createAdmin, searchUsers, changeUserPassword, deleteUser } from "../controllers/admin.controller.js";

const router = express.Router();

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    // req.user should be set by isAuthenticated middleware
    let user = req.user;

    // fallback if req.user is missing
    if (!user && req.id) {
      user = await User.findById(req.id);
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only.",
      });
    }
    next();
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Admin routes
router.get("/violations", isAuthenticated, isAdmin, getViolations);
router.post("/ban/:userId", isAuthenticated, isAdmin, banUser);
router.post("/unban/:userId", isAuthenticated, isAdmin, unbanUser);
router.delete("/delete-user/:userId", isAuthenticated, isAdmin, deleteUser);
router.get("/alumni", isAuthenticated, isAdmin, getAlumni);
router.get("/teachers", isAuthenticated, isAdmin, getTeachers);
router.post("/create-teacher", isAuthenticated, isAdmin, createTeacher);
router.post("/create-admin", isAuthenticated, isAdmin, createAdmin);
router.get("/search-users", isAuthenticated, isAdmin, searchUsers);
router.post("/change-password", isAuthenticated, isAdmin, changeUserPassword);

export default router;