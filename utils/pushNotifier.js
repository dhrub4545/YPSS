const User = require('../models/User');

const sendExpoPushNotifications = async (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return;
  try {
    const chunks = [];
    const CHUNK_SIZE = 100;
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      chunks.push(messages.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of chunks) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      const data = await response.json();
      console.log(`[PushNotifier] Dispatched ${chunk.length} push notification(s) via Expo:`, data);
    }
  } catch (err) {
    console.warn('[PushNotifier] Error sending Expo push notifications:', err.message);
  }
};

const notifyWalkieTalkieDispatch = async ({ sender, type, recipientId, duration, audioUrl, messageId }) => {
  try {
    let targetUsers = [];
    if (type === 'broadcast') {
      // Find all teachers and principal except sender
      targetUsers = await User.find({
        _id: { $ne: sender._id },
        role: { $in: ['principal', 'teacher'] },
        pushTokens: { $exists: true, $not: { $size: 0 } },
      }).select('pushTokens name role');
    } else if (recipientId) {
      targetUsers = await User.find({
        _id: recipientId,
        pushTokens: { $exists: true, $not: { $size: 0 } },
      }).select('pushTokens name role');
    }

    if (!targetUsers.length) {
      console.log('[PushNotifier] No registered push tokens found for recipients.');
      return;
    }

    let fullAudioUrl = audioUrl;
    if (fullAudioUrl && (fullAudioUrl.startsWith('/uploads') || fullAudioUrl.startsWith('uploads/'))) {
      fullAudioUrl = `https://ypssbackend.vercel.app/${fullAudioUrl.replace(/^\/+/, '')}`;
    }

    const title = type === 'broadcast'
      ? `📢 Walkie-Talkie: All Staff Broadcast`
      : `📻 Walkie-Talkie: ${sender.name} (${sender.role === 'principal' ? 'Principal' : 'Teacher'})`;

    const body = `🎙️ ${sender.name} sent a ${duration || 3}s voice dispatch. Tap ▶️ to listen!`;

    const pushMessages = [];
    for (const u of targetUsers) {
      if (Array.isArray(u.pushTokens)) {
        for (const token of u.pushTokens) {
          if (token && typeof token === 'string' && (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'))) {
            pushMessages.push({
              to: token,
              sound: 'default',
              title,
              body,
              priority: 'high',
              channelId: 'walkie-talkie',
              categoryIdentifier: 'walkie_talkie_voice',
              contentAvailable: true,
              _displayInForeground: true,
              badge: 1,
              subtitle: 'Voice Dispatch',
              data: {
                type: 'walkie-talkie',
                messageId: messageId ? messageId.toString() : undefined,
                senderId: sender._id ? sender._id.toString() : undefined,
                senderName: sender.name,
                senderRole: sender.role,
                audioUrl: fullAudioUrl,
                duration: duration || 3,
                dispatchType: type,
              },
            });
          }
        }
      }
    }

    if (pushMessages.length > 0) {
      await sendExpoPushNotifications(pushMessages);
    }
  } catch (err) {
    console.warn('[PushNotifier] notifyWalkieTalkieDispatch error:', err.message);
  }
};

const notifyNoticePublished = async ({ notice, sender }) => {
  try {
    let query = {
      pushTokens: { $exists: true, $not: { $size: 0 } },
    };

    if (notice.audience === 'individual' || (Array.isArray(notice.targetUsers) && notice.targetUsers.length > 0)) {
      const allowedIds = (notice.targetUsers || []).map((id) => (id?._id || id).toString());
      if (!allowedIds.length) {
        console.log('[PushNotifier] Individual notice has no target users specified.');
        return;
      }
      if (sender?._id) {
        query._id = { $in: allowedIds, $ne: sender._id };
      } else {
        query._id = { $in: allowedIds };
      }
    } else {
      if (sender?._id) {
        query._id = { $ne: sender._id };
      }

      if (notice.audience === 'teachers') {
        query.role = 'teacher';
      } else if (notice.audience === 'students') {
        query.role = 'student';
      } else if (notice.audience === 'parents') {
        query.role = 'parent';
      } else {
        query.role = { $in: ['teacher', 'student', 'parent', 'principal'] };
      }
    }

    const targetUsers = await User.find(query).select('pushTokens name role');
    if (!targetUsers.length) {
      console.log(`[PushNotifier] No registered push tokens for audience "${notice.audience}".`);
      return;
    }

    const categoryIcons = {
      urgent: '🚨',
      exam: '📝',
      holiday: '🎉',
      fee: '💰',
      general: '📢',
    };
    const icon = categoryIcons[notice.category] || '📢';
    const title = `${icon} School Notice: ${notice.title}`;
    const cleanContent = (notice.content || '').replace(/\s+/g, ' ').trim();
    const body = cleanContent.length > 120 ? cleanContent.slice(0, 117) + '...' : cleanContent;

    const pushMessages = [];
    for (const u of targetUsers) {
      if (Array.isArray(u.pushTokens)) {
        for (const token of u.pushTokens) {
          if (token && typeof token === 'string' && (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'))) {
            pushMessages.push({
              to: token,
              sound: 'default',
              title,
              body,
              priority: 'high',
              channelId: 'school-notices',
              data: {
                type: 'notice',
                noticeId: notice._id ? notice._id.toString() : undefined,
                title: notice.title,
                category: notice.category,
                dateBS: notice.dateBS,
              },
            });
          }
        }
      }
    }

    if (pushMessages.length > 0) {
      await sendExpoPushNotifications(pushMessages);
    }
  } catch (err) {
    console.warn('[PushNotifier] notifyNoticePublished error:', err.message);
  }
};

const notifyMarksCardsPublished = async ({ className, terminal, academicYear, targetUserIds, noticeId, sender }) => {
  try {
    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) return;

    const query = {
      _id: { $in: targetUserIds },
      pushTokens: { $exists: true, $not: { $size: 0 } },
    };
    if (sender?._id) {
      query._id = { $in: targetUserIds, $ne: sender._id };
    }

    const targetUsers = await User.find(query).select('pushTokens name role');
    if (!targetUsers.length) {
      console.log(`[PushNotifier] No registered push tokens found for ${className} students/parents.`);
      return;
    }

    const title = `🎖️ Result Published: ${className} - Terminal ${terminal}`;
    const body = `Official marks cards for ${className} (Terminal ${terminal}) have been published! Tap to view your report card.`;

    const pushMessages = [];
    for (const u of targetUsers) {
      if (Array.isArray(u.pushTokens)) {
        for (const token of u.pushTokens) {
          if (token && typeof token === 'string' && (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'))) {
            pushMessages.push({
              to: token,
              sound: 'default',
              title,
              body,
              priority: 'high',
              channelId: 'school-notices',
              data: {
                type: 'marks_card',
                noticeId: noticeId ? noticeId.toString() : undefined,
                className,
                terminal,
                academicYear,
              },
            });
          }
        }
      }
    }

    if (pushMessages.length > 0) {
      await sendExpoPushNotifications(pushMessages);
      console.log(`[PushNotifier] Dispatched marks card publish push notifications to ${pushMessages.length} devices.`);
    }
  } catch (err) {
    console.warn('[PushNotifier] notifyMarksCardsPublished error:', err.message);
  }
};

module.exports = {
  sendExpoPushNotifications,
  notifyWalkieTalkieDispatch,
  notifyNoticePublished,
  notifyMarksCardsPublished,
};

