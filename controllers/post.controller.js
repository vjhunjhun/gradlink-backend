import sharp from "sharp";
import Post from "../MODEL/post.model.js";
import User from "../MODEL/user.model.js";
import Notification from "../MODEL/notification.model.js";
import Comment from "../MODEL/comment.model.js";
import cloudinary from "../utils/cloudinary.js";
import { getReceiverSocketId, io } from "../socket/socket.js";

export const addNewPost = async (req, res) => {
  try {
    const { caption } = req.body;
    const image = req.file;
    const authorId = req.id;

    if (!image) {
      return res.status(400).json({
        message: "Image required",
        success: false,
      });
    }

    const optimizedImageBuffer = await sharp(image.buffer)
      .resize({ width: 800, height: 800, fit: "inside" })
      .toFormat("jpeg", { quality: 80 })
      .toBuffer();
    const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString("base64")}`;
    const cloudResponse = await cloudinary.uploader.upload(fileUri);
    const post = await Post.create({
      caption,
      image: cloudResponse.secure_url,
      author: authorId,
    });
    const user = await User.findById(authorId);
    if (user) {
      user.posts.push(post?._id);
      await user.save();
    }
    const postToSend = await Post.findById(post._id)
          .populate({ path: "author", select: "name profilePicture role" })
          .populate({
            path: "comments",
            sort: { createdAt: -1 },
            populate: {
              path: "author",
              select: "name profilePicture role",
            },
          });
    io.emit("new_post", postToSend);
    return res.status(201).json({
      message: "New Post Added!",
      success: true,
      post:postToSend,
    });
  } catch (error) {
    console.log(error);
  }
};

// export const getAllPost = async (req, res) => {
//   try {
//     const userId = req.id;
//     const { following, followers } = await User.findById(userId).select("following followers");
//     const posts = await Post.find()
//       .sort({ createdAt: -1 })
//       .populate({ path: "author", select: "name profilePicture" })
//       .populate({
//         path: "comments",
//         sort: { createdAt: -1 },
//         populate: {
//           path: "author",
//           select: "name profilePicture",
//         },
//       });
//     return res.status(200).json({
//       posts,
//       success: true,
//     });
//   } catch (error) {
//     console.log(error);
//   }
// };
export const getAllPost = async (req, res) => { 
  try {
  const userId = req.id;
  const user = await User.findById(userId).select("following followers");
  const posts = await Post.aggregate([
    {
      $addFields: {
        priority: {
          $cond: [
            { $in: ["$author", user.following] },
            0,
            {
              $cond: [{ $in: ["$author", user.followers] }, 1, 2],
            },
          ],
        },
      },
    },
    {
      $sort: {
        priority: 1,
        createdAt: -1,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "author",
        foreignField: "_id",
        as: "author",
      },
    },
    { $unwind: "$author" },
    {
      $project: {
        caption: 1,
        image: 1,
        likes: 1,
        comments: 1,
        createdAt: 1,
        updatedAt: 1,
        "author._id": 1,
        "author.name": 1,
        "author.profilePicture": 1,
        "author.role": 1,
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "comments",
        foreignField: "_id",
        as: "comments",
      },
    },
  ]);
    return res.status(200).json({
      posts,
      success: true,
    });
} catch (error) {
  console.log(error);
}
}

export const getUserPost = async (req, res) => {
  try {
    const authorId = req.id;
    const posts = await Post.find({ author: authorId })
      .sort({ createdAt: -1 })
      .populate({ path: "author", select: "name profilePicture role" })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: {
          path: "author",
          select: "name profilePicture",
        },
      });
    return res.status(200).json({
      posts,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const likePost = async (req, res) => {
  try {
    const likedByUserId = req.id;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        message: "Post not found!",
        success: false,
      });
    }
    await post.updateOne({ $addToSet: { likes: likedByUserId } });
    await post.save();
    const newPost = await Post.findById(postId);
    //implement socket io for real time notification
    const user = await User.findById(likedByUserId).select("name profilePicture");
    const postOwnerId = post.author.toString();
    io.emit("feed_update", newPost);
    if (postOwnerId !== likedByUserId.toString()) {
      //emit a notification event
      const notification = {
        type: "like",
        userId: likedByUserId,
        userDetails: user,
        postId,
        message: `your post ${post?.caption} was liked`,
        read:false,
      }
      const toSaveNotify = await Notification.create({ ...notification,userDetails:user?._id, receiverId: post.author });
      await toSaveNotify.save();
      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      io.to(postOwnerSocketId).emit("notification", notification);
    }
    return res.status(200).json({
      message: "Post liked!",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const dislikePost = async (req, res) => {
  try {
    const dislikedByUserId = req.id;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        message: "Post not found!",
        success: false,
      });
    }
    await post.updateOne({ $pull: { likes: dislikedByUserId } });
    await post.save();
    const newPost = await Post.findById(postId);
    io.emit("feed_update", newPost);
    //implement socket io for real time notification
   const user = await User.findById(dislikedByUserId).select(
      "name profilePicture",
    );
    const postOwnerId = post.author.toString();
    if (postOwnerId !== dislikedByUserId.toString()) {
      //emit a notification event
      const notification = {
        type: "dislike",
        userId: dislikedByUserId,
        userDetails: user,
        postId,
        message: `your post ${post?.caption} was disliked`,
        read:false,
      };
      await Notification.deleteOne({ userId: dislikedByUserId, postId });
      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      io.to(postOwnerSocketId).emit("notification", notification);
    }
    return res.status(200).json({
      message: "Post disliked!",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const addComment = async (req, res) => {
  try {
    const postId = req.params.id;
    const commentByUserId = req.id;
    const { text } = req.body;
    const post = await Post.findById(postId);
    if (!text) {
      return res.status(400).json({
        message: "Comment is required!",
        success: false,
      });
    }
    const comment = await Comment.create({
      text,
      author: commentByUserId,
      post: postId,
    });

    await comment.populate({
      path: "author",
      select: "name  profilePicture",
    });

    post.comments.push(comment?._id);
    await post.save();
    const newPost = await Post.findById(postId);
    io.emit("feed_update", newPost);
    if (post.author.toString() !== commentByUserId.toString()) {
      const notification = {
        type: "comment",
        userId: commentByUserId,
        userDetails: commentByUserId,
        receiverId: post.author,
        postId,
        message: `commented on your post ${post?.caption}`,
        read: false,
      };
      const toSaveNotify = await Notification.create(notification);
      await toSaveNotify.save();
      const postOwnerSocketId = getReceiverSocketId(post.author);
      const user = await User.findById(commentByUserId).select(
                      "name profilePicture",
                    );
      io.to(postOwnerSocketId).emit("notification", { ...notification,userDetails:user });
    }
    return res.status(201).json({
      message: "Comment Added",
      success: true,
      comment,
    });
  } catch (error) {
    console.log(error);
  }
};

export const getCommentsOfPost = async (req, res) => {
  try {
    const postId = req.params.id;
    //i know this will fail
    const comments = await Comment.find({ post: postId }).populate({
      path: "author",
      select: "name profilePicture role",
    });
    if (!comments) {
      return res.status(404).json({
        message: "No comments found!",
        success: false,
        comments
      });
    }
    return res.status(200).json({
      comments,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.id;
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({
        message: "Post not found!",
        success: false,
      });
    }

    const requester = await User.findById(userId);
    const isAuthor = post.author.toString() === userId.toString();
    const isTeacher = requester.role === "teacher";

    // Only author or teacher can delete
    if (!isAuthor && !isTeacher) {
      return res.status(403).json({
        message: "Unauthorized!!",
        success: false,
      });
    }

    const postAuthorId = post.author.toString();
    
    await Post.findByIdAndDelete(postId);
    let postOwner = await User.findById(postAuthorId);
    postOwner.posts = postOwner.posts.filter((id) => id.toString() !== postId);
    await postOwner.save();

    // Delete comments
    await Comment.deleteMany({ post: postId });
    await Notification.deleteMany({ postId: postId });

    // If teacher deleted the post, send notification and message to owner
    if (!isAuthor && isTeacher) {
      const teacher = await User.findById(userId).select("name profilePicture");
      
      // Create notification
      const notification = {
        type: "post_deleted",
        userId: userId,
        userDetails: teacher,
        postId: postId,
        message: "A teacher deleted your post",
        read: false,
      };
      await Notification.create({ ...notification, userDetails: teacher._id, receiverId: postAuthorId });
      const postOwnerSocketId = getReceiverSocketId(postAuthorId);
      io.to(postOwnerSocketId).emit("notification", { ...notification, userDetails: teacher });

      // Send system message to post author
      try {
        const Conversation = (await import("../MODEL/conversation.model.js")).default;
        const Message = (await import("../MODEL/message.model.js")).default;
        
        let conversation = await Conversation.findOne({
          participants: { $all: [userId, postAuthorId] },
        });
        if (!conversation) {
          conversation = await Conversation.create({
            participants: [userId, postAuthorId],
          });
        }
        
        const systemMessage = await Message.create({
          senderId: userId,
          receiverId: postAuthorId,
          message: `[System Message] Your post has been deleted for violating community guidelines.`,
        });
        
        if (systemMessage) {
          conversation.messages.push(systemMessage._id);
        }
        await conversation.save();
        
        const receiverSocketId = getReceiverSocketId(postAuthorId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("newMessage", systemMessage);
        }
      } catch (messageError) {
        console.log("Error sending message notification:", messageError);
        // Continue with the response even if message fails
      }
    }

    const sendPost = { author: postAuthorId, id: postId };
    io.emit("post_delete", sendPost);
    
    return res.status(200).json({
      success: true,
      message: "Post deleted!",
    });
  } catch (error) {
    console.log(error);
  }
};

export const bookmarkPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const authorId = req.id;
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        message: "Post not found",
        success: false,
      });
    }
    const user = await User.findById(authorId);
    if (user.bookmarks.includes(post?._id)) {
      //already bookmarked need to remove
      await user.updateOne({ $pull: { bookmarks: post?._id } });
      await user.save();
      return res
        .status(200)
        .json({
          type: "unsaved",
          message: "Post removed from bookmark",
          success: true,
        });
    } else {
      //add bookmark
      await user.updateOne({ $addToSet: { bookmarks: post?._id } });
      await user.save();
      return res.status(200).json({
        type: "saved",
        message: "Post bookmarked",
        success: true,
      });
    }
  } catch (error) {
    console.log(error);
  }
};