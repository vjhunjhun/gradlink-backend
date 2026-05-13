import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./utils/db.js";
import userRoute from "./routes/user.route.js"
import postRoute from "./routes/post.route.js"
import messageRoute from "./routes/message.route.js"
import adminRoute from "./routes/admin.route.js"
import groupRoute from "./routes/group.route.js"
import { app, server } from "./socket/socket.js";
import path from "path";
dotenv.config({});
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
};
app.use(cors(corsOptions));

app.use("/api/v1/user", userRoute);
app.use("/api/v1/post", postRoute);
app.use("/api/v1/message", messageRoute);
app.use("/api/v1/admin", adminRoute);
app.use("/api/v1/group", groupRoute);

// app.use(express.static(path.join(__dirname, "/frontend/dist")));
// app.get("{*splat}", (req, res) => {
//   res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"));
// });
server.listen(PORT, () => {
  connectDB();
  console.log(`App listening to Port ${PORT}`);
});