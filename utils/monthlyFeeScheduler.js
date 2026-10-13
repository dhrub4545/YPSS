const nd = require('nepali-date-converter');
const NepaliDate = nd.default || nd;
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const Notice = require('../models/Notice');

/**
 * Idempotent, stateless check for monthly fee notifications.
 * Verifies against MongoDB records rather than in-memory variables,
 * making it 100% safe to invoke from Vercel Serverless / Vercel Cron.
 */
const checkAndTriggerMonthlyFeeNotifications = async (force = false) => {
  try {
    const today = new Date();
    const isFirstDay = today.getDate() === 1;

    // Only run on the 1st day of the month unless explicitly forced by manual/cron trigger
    if (!isFirstDay && !force) {
      return { triggered: false, count: 0, reason: 'Not 1st day of month' };
    }

    const nepaliDateStr = new NepaliDate(today).format('YYYY-MM-DD');
    const targetDateBS = `${nepaliDateStr} B.S.`;

    const students = await Student.find().populate('user class parent');
    const allFees = await Fee.find().lean();
    const { notifyNoticePublished } = require('./pushNotifier');

    let count = 0;
    for (const student of students) {
      const studentFees = allFees.filter((f) => String(f.student) === String(student._id));
      const totalDue = studentFees.reduce((acc, f) => acc + (f.amountDue || 0), 0);
      const totalPaid = studentFees.reduce((acc, f) => acc + (f.amountPaid || 0), 0);
      const remaining = Math.max(0, totalDue - totalPaid);

      if (remaining > 0) {
        const studentName = student.user?.name || 'Student';
        const expectedTitle = `🗓️ Monthly Fee Reminder: ${studentName}`;

        // Check MongoDB directly to ensure zero duplicate notifications across serverless invocations
        const alreadyNotified = await Notice.findOne({
          category: 'fee',
          title: expectedTitle,
          dateBS: targetDateBS,
        });

        if (alreadyNotified && !force) {
          continue;
        }

        count++;
        const className = student.class?.name || 'Class';

        const targetUserIds = [];
        if (student.user?._id) targetUserIds.push(student.user._id);
        if (student.parent?._id) targetUserIds.push(student.parent._id);
        else if (student.parent) targetUserIds.push(student.parent);

        const notice = await Notice.create({
          title: expectedTitle,
          content: `Default Monthly Fee Notice (${targetDateBS}):\nDear Parent & Student, this is an automated fee reminder for ${studentName} (${className}, Roll #${student.rollNumber || '—'}). Remaining fee balance: NPR ${remaining.toLocaleString()}.\nKindly make payment at the school accounts section or via digital transfer at your earliest convenience. Thank you!`,
          category: 'fee',
          audience: 'individual',
          targetUsers: targetUserIds,
          targetStudent: student._id,
          dateBS: targetDateBS,
        });

        // Dispatch push notification directly to targeted student & parent devices only
        notifyNoticePublished({ notice }).catch((err) => {
          console.warn('[Monthly Fee Scheduler] Failed to dispatch push notification:', err.message);
        });
      }
    }

    console.log(`[Monthly Fee Scheduler] Sent default monthly fee notifications to ${count} accounts.`);
    return { triggered: true, count, dateBS: targetDateBS };
  } catch (err) {
    console.error('[Monthly Fee Scheduler Error]', err.message);
    return { triggered: false, error: err.message };
  }
};

const startMonthlyFeeScheduler = () => {
  // Serverless environments (like Vercel) freeze background intervals; crons are handled via HTTP endpoint
  if (process.env.VERCEL) {
    console.log('[Monthly Fee Scheduler] Running in serverless mode (Vercel). Interval timer bypassed.');
    return;
  }

  // Standalone/dev execution: run initial check and 4-hour background interval
  checkAndTriggerMonthlyFeeNotifications().catch(console.error);
  setInterval(() => {
    checkAndTriggerMonthlyFeeNotifications().catch(console.error);
  }, 4 * 60 * 60 * 1000);
};

module.exports = {
  startMonthlyFeeScheduler,
  checkAndTriggerMonthlyFeeNotifications,
};
