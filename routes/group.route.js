import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import {
  createGroup,
  addMembersToGroup,
  getUserGroups,
  getGroupMessages,
  sendGroupMessage,
  removeMemberFromGroup,
  deleteGroup,
} from "../controllers/group.controller.js";

const router = express.Router();

router.route("/create").post(isAuthenticated, createGroup);
router.route("/all").get(isAuthenticated, getUserGroups);
router.route("/:groupId/messages").get(isAuthenticated, getGroupMessages);
router.route("/:groupId/send-message").post(isAuthenticated, sendGroupMessage);
router.route("/:groupId/add-members").post(isAuthenticated, addMembersToGroup);
router.route("/:groupId/remove-member/:memberId").delete(isAuthenticated, removeMemberFromGroup);
router.route("/:groupId/delete").delete(isAuthenticated, deleteGroup);

export default router;
