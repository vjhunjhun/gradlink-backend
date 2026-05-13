import jwt from "jsonwebtoken";
import User from "../MODEL/user.model.js";

const isAuthenticated = async (req, res, next) => {
    try {
      const token = req.cookies.token;
         if (!token) {
           return res.status(401).json({
             message: "User not authenticated",
             success: false,
           });
        };
        const decode = jwt.verify(token, process.env.SECRET_KEY);
          if (!decode) {
            return res.status(401).json({
              message: "Invalid",
              success: false,
            });
        };

        const user = await User.findById(decode.userId);
        if (!user) {
          return res.status(401).json({
            message: "User not found",
            success: false,
          });
        }

        if (user.isBanned) {
          return res.status(403).json({
            message: "Your account has been banned",
            success: false,
          });
      }
       if (user.isDeleted) {
         return res.status(403).json({
           message: "Your account has been deleted",
           success: false,
         });
       }

        req.user = user;
        req.id = user._id;

        next();
    } catch (error) {
        console.log(error);
    
    }
};

export default isAuthenticated;
