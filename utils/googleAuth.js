import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google ID Token and extract user info
 * @param {string} token - The Google ID token from frontend
 * @returns {Promise<Object>} - User data from token (email, name, picture, etc.)
 */
export const verifyGoogleToken = async (token) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    
    // Check if email is from allowed domain
    if (!payload.email.endsWith("@pcampus.edu.np")) {
      throw new Error("Only @pcampus.edu.np emails are allowed");
    }

    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
      sub: payload.sub, // Google unique ID
    };
  } catch (error) {
    console.log("Google token verification error:", error.message);
    throw new Error("Invalid Google token");
  }
};

export default {
  verifyGoogleToken,
};
