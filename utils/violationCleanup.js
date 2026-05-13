import ChatViolation from "../MODEL/chatViolation.model.js";
import User from "../MODEL/user.model.js";

// Track last cleanup time in memory
let lastCleanupTime = null;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Cleanup resolved violations where user is not banned
 * Removes violations older than specified days
 * @param {number} daysOld - Delete violations older than this many days (default: 7)
 * @returns {Promise<Object>} - Result with count of deleted violations
 */
export const cleanupResolvedViolations = async (daysOld = 7) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Find all resolved violations older than cutoffDate where user is not banned
    const violationsToDelete = await ChatViolation.find({
      isResolved: true,
      createdAt: { $lt: cutoffDate },
    }).populate("user", "isBanned");

    // Filter violations where user is not banned
    const violationIdsToDelete = violationsToDelete
      .filter((violation) => violation.user && !violation.user.isBanned)
      .map((violation) => violation._id);

    if (violationIdsToDelete.length === 0) {
      lastCleanupTime = Date.now(); // Update cleanup time even if no violations found
      return {
        success: true,
        deletedCount: 0,
      };
    }

    // Delete the filtered violations
    const result = await ChatViolation.deleteMany({
      _id: { $in: violationIdsToDelete },
    });

    lastCleanupTime = Date.now(); // Update cleanup time after successful cleanup
    console.log(
      `[Violation Cleanup] Deleted ${result.deletedCount} resolved non-banned violations older than ${daysOld} days`
    );

    return {
      success: true,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    console.error("[Cleanup Error]", error.message);
    return {
      success: false,
      deletedCount: 0,
    };
  }
};

/**
 * Check if cleanup should run based on 24-hour interval
 * Returns true if 24 hours have passed since last cleanup
 * @returns {boolean}
 */
export const shouldRunCleanup = () => {
  if (lastCleanupTime === null) {
    return true; // First time, run cleanup
  }
  const timeSinceLastCleanup = Date.now() - lastCleanupTime;
  return timeSinceLastCleanup >= CLEANUP_INTERVAL_MS;
};

/**
 * Trigger cleanup if 24 hours have passed (called on admin signin)
 * Runs cleanup asynchronously in background without blocking admin login
 */
export const triggerCleanupOnAdminSignin = async () => {
  if (shouldRunCleanup()) {
    // Run cleanup in background without awaiting
    cleanupResolvedViolations().catch((error) => {
      console.error("[Background Cleanup Error]", error);
    });
  }
};

export default {
  cleanupResolvedViolations,
  shouldRunCleanup,
  triggerCleanupOnAdminSignin,
};
