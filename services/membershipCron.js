const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../models/User');
const membershipService = require('./membershipService');
const { getPlan, getDefaultPlan } = require('../config/membershipPlan');

function startMembershipCron(notificationService) {
  membershipService.setNotificationService(notificationService);

  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('⏰ Membership cron: starting check...');
    const now = new Date();

    try {
      // 1. Expire memberships where auto-renew is OFF and expiry has passed
      const toExpire = await User.findAll({
        where: {
          membershipStatus: { [Op.in]: ['active', 'cancelled'] },
          membershipAutoRenew: false,
          membershipExpiresAt: { [Op.lt]: now }
        }
      });

      for (const user of toExpire) {
        try {
          await membershipService.expireMembership(user);
          console.log(`⏰ Expired membership for user ${user.id}`);
        } catch (err) {
          console.error(`⏰ Error expiring membership for user ${user.id}:`, err.message);
        }
      }

      // 2. Auto-renew memberships where auto-renew is ON and expiry has passed
      const toRenew = await User.findAll({
        where: {
          membershipStatus: { [Op.in]: ['active'] },
          membershipAutoRenew: true,
          membershipExpiresAt: { [Op.lt]: now }
        }
      });

      for (const user of toRenew) {
        try {
          const userPlan = getPlan(user.membershipPlan) || getDefaultPlan();
          await membershipService.renewMembership(user, userPlan);
          console.log(`⏰ Renewed membership for user ${user.id}`);
        } catch (err) {
          console.error(`⏰ Renewal failed for user ${user.id}:`, err.message);
          // On payment failure, expire the membership
          try {
            await membershipService.expireMembership(user);
            if (notificationService) {
              await notificationService.createNotification({
                userId: user.id,
                type: 'membership',
                title: 'Échec du renouvellement',
                message: 'Le paiement de renouvellement UMOD Prime a échoué. Vérifiez votre méthode de paiement.',
                data: { membershipStatus: 'expired' }
              });
            }
          } catch (expireErr) {
            console.error(`⏰ Error expiring after failed renewal for user ${user.id}:`, expireErr.message);
          }
        }
      }

      // 3. Send expiry warnings (3 days before expiration)
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const toWarn = await User.findAll({
        where: {
          membershipStatus: 'active',
          membershipExpiresAt: {
            [Op.gt]: now,
            [Op.lte]: threeDaysFromNow
          }
        }
      });

      for (const user of toWarn) {
        try {
          const daysLeft = Math.ceil((new Date(user.membershipExpiresAt) - now) / (1000 * 60 * 60 * 24));
          if (notificationService) {
            await notificationService.createNotification({
              userId: user.id,
              type: 'membership',
              title: 'Abonnement bientôt expiré',
              message: `Votre UMOD Prime expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}. ${user.membershipAutoRenew ? 'Le renouvellement automatique est activé.' : 'Pensez à le renouveler !'}`,
              data: { membershipStatus: 'expiring', daysLeft }
            });
          }
        } catch (err) {
          console.error(`⏰ Error sending expiry warning for user ${user.id}:`, err.message);
        }
      }

      console.log(`⏰ Membership cron complete: ${toExpire.length} expired, ${toRenew.length} renewed, ${toWarn.length} warned`);
    } catch (error) {
      console.error('⏰ Membership cron error:', error);
    }
  });

  console.log('✅ Membership cron job started (runs every hour)');
}

module.exports = { startMembershipCron };
