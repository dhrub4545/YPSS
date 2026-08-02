const nd = require('nepali-date-converter');
const NepaliDate = nd.default || nd;
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const Notice = require('../models/Notice');

let lastNotificationMonth = '';

const checkAndTriggerMonthlyFeeNotifications = async () => {
  try {
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth() + 1}-01`;

    // Trigger automatically on the 1st day of the calendar month once per month
    if (today.getDate() === 1 && lastNotificationMonth !== currentMonthKey) {
      lastNotificationMonth = currentMonthKey;

      const students = await Student.find().populate('user class');
      const allFees = await Fee.find().lean();

      let count = 0;
      for (const student of students) {
        const studentFees = allFees.filter((f) => String(f.student) === String(student._id));
        const totalDue = studentFees.reduce((acc, f) => acc + (f.amountDue || 0), 0);
        const totalPaid = studentFees.reduce((acc, f) => acc + (f.amountPaid || 0), 0);
        const remaining = Math.max(0, totalDue - totalPaid);

        if (remaining > 0) {
          count++;
          const studentName = student.user?.name || 'Student';
          const className = student.class?.name || 'Class';
          const nepaliDateStr = new NepaliDate(today).format('YYYY-MM-DD');

          await Notice.create({
            title: `🗓️ Monthly Fee Reminder: ${studentName}`,
            content: `Default Monthly Fee Notice (${nepaliDateStr} B.S.):\nDear Parent & Student, this is an automated fee reminder for ${studentName} (${className}, Roll #${student.rollNumber || '—'}). Remaining fee balance: NPR ${remaining.toLocaleString()}.\nKindly make payment at the school accounts section or via digital transfer at your earliest convenience. Thank you!`,
            category: 'fee',
            audience: 'all',
            dateBS: `${nepaliDateStr} B.S.`,
          });
        }
      }
      console.log(`[Monthly Fee Scheduler] Sent default 1st-of-month fee notifications to ${count} accounts.`);
    }
  } catch (err) {
    console.error('[Monthly Fee Scheduler Error]', err.message);
  }
};

const startMonthlyFeeScheduler = () => {
  // Initial check on boot
  checkAndTriggerMonthlyFeeNotifications();
  // Check every 4 hours
  setInterval(checkAndTriggerMonthlyFeeNotifications, 4 * 60 * 60 * 1000);
};

module.exports = { startMonthlyFeeScheduler, checkAndTriggerMonthlyFeeNotifications };
