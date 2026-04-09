const cron = require('node-cron');
const { Notification } = require('../models');
const { Op } = require('sequelize');

function startNotificationCleanup() {
  // Run daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('🧹 Running notification cleanup...');

    try {
      const now = new Date();

      // Delete expired notifications
      const expiredDeleted = await Notification.destroy({
        where: {
          expiresAt: { [Op.lt]: now }
        }
      });

      // Delete read notifications older than 90 days
      const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);
      const oldReadDeleted = await Notification.destroy({
        where: {
          isRead: true,
          createdAt: { [Op.lt]: ninetyDaysAgo }
        }
      });

      // Archive unread notifications older than 30 days
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const [archivedCount] = await Notification.update(
        { isArchived: true },
        {
          where: {
            isRead: false,
            isArchived: false,
            createdAt: { [Op.lt]: thirtyDaysAgo }
          }
        }
      );

      console.log(`🧹 Cleanup complete: ${expiredDeleted} expired deleted, ${oldReadDeleted} old read deleted, ${archivedCount} archived`);
    } catch (error) {
      console.error('❌ Notification cleanup error:', error);
    }
  });

  console.log('🧹 Notification cleanup cron scheduled (daily at 3 AM)');
}

module.exports = { startNotificationCleanup };
