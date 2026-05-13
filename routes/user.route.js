import express from "express";
import {
  deleteNotification,
  editProfile,
  followOrUnfollow,
  getChatUsers,
  getFollowers,
  getFollowing,
  getNotifications,
  getProfile,
  getSuggestedUsers,
  login,
  logout,
  register,
  searchUsers,
  verifyEmail,
  seedAdmin,
  changePassword,
  googleSignup,
  googleSignin,
} from "../controllers/user.controller.js";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import upload from "../middlewares/multer.js";
const router = express.Router();

router.route("/register").post(register);
router.route("/login").post(login);
router.route("/google-signup").post(googleSignup);
router.route("/google-signin").post(googleSignin);
router.route("/logout").get(logout);
router.route("/verify/:token").get(verifyEmail);
router.route("/chat-users").get(isAuthenticated, getChatUsers);
router.route("/search").get(isAuthenticated, searchUsers);
router.route("/:id/profile").get(isAuthenticated, getProfile);
router.route("/:id/followers").get(isAuthenticated, getFollowers);
router.route("/:id/following").get(isAuthenticated, getFollowing);
router
  .route("/profile/edit")
  .post(isAuthenticated, upload.single("profilePicture"), editProfile);
router.route("/suggested").get(isAuthenticated,getSuggestedUsers);
router
  .route("/notification/:id")
  .get(isAuthenticated, getNotifications)
  .delete(isAuthenticated,deleteNotification);
router.route("/followorunfollow/:id").post(isAuthenticated, followOrUnfollow);
router.route("/seed-admin").post(seedAdmin);
router.route("/change-password").post(isAuthenticated, changePassword);

export default router;
