const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

let messagingClient = null;
let isInitialized = false;

try {
  let app = null;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
    isInitialized = true;
  } else {
    // 1. Check for firebase-service-account.json file
    const localKeyPath = path.join(__dirname, '../firebase-service-account.json');
    if (fs.existsSync(localKeyPath)) {
      const serviceAccount = require(localKeyPath);
      app = initializeApp({
        credential: cert(serviceAccount),
      });
      isInitialized = true;
      console.log(`[FCM] Firebase Admin SDK initialized for project "${serviceAccount.project_id}"`);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // 2. Check for JSON string or path in environment variable
      let serviceAccount = null;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (_) {
        if (fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT)) {
          serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT);
        }
      }
      if (serviceAccount) {
        app = initializeApp({
          credential: cert(serviceAccount),
        });
        isInitialized = true;
        console.log(`[FCM] Firebase Admin SDK initialized via env for project "${serviceAccount.project_id}"`);
      }
    } else {
      console.log('[FCM] Notice: Direct FCM credentials not yet configured. (Place backend/firebase-service-account.json to activate direct FCM dispatch)');
    }
  }

  if (app) {
    messagingClient = getMessaging(app);
  }
} catch (err) {
  console.warn('[FCM] Initialization notice:', err.message);
  isInitialized = false;
  messagingClient = null;
}

const isFcmConfigured = () => isInitialized && messagingClient !== null;

/**
 * Sends a high-priority headless data message directly to Android FCM device tokens
 */
const sendFcmWalkieTalkieDispatch = async ({
  fcmTokens,
  sender,
  type,
  duration,
  audioUrl,
  messageId,
}) => {
  if (!isFcmConfigured() || !Array.isArray(fcmTokens) || fcmTokens.length === 0) {
    return { success: false, sentCount: 0 };
  }

  try {
    const title =
      type === 'broadcast'
        ? '📢 Walkie-Talkie: All Staff Broadcast'
        : `📻 Walkie-Talkie: ${sender.name} (${sender.role === 'principal' ? 'Principal' : 'Teacher'})`;

    const body = `🎙️ ${sender.name} sent a ${duration || 3}s voice dispatch. Tap ▶️ to listen!`;

    // Data-only payload for terminated / headless background wake-up on Android and iOS
    const message = {
      tokens: fcmTokens,
      android: {
        priority: 'high',
        ttl: 3600 * 1000, // 1 hour TTL
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
          },
        },
        headers: {
          'apns-push-type': 'background',
          'apns-priority': '5',
        },
      },
      data: {
        type: 'walkie-talkie',
        title,
        body,
        messageId: messageId ? messageId.toString() : '',
        senderId: sender._id ? sender._id.toString() : '',
        senderName: sender.name || 'Staff',
        senderRole: sender.role || 'teacher',
        audioUrl: audioUrl || '',
        duration: String(duration || 3),
        dispatchType: type || 'direct',
      },
    };

    const response = await messagingClient.sendEachForMulticast(message);
    console.log(
      `[FCM] Dispatched Walkie-Talkie voice alert to ${response.successCount}/${fcmTokens.length} native devices (failure: ${response.failureCount})`
    );
    return { success: true, sentCount: response.successCount };
  } catch (err) {
    console.warn('[FCM] sendFcmWalkieTalkieDispatch error:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Sends standard notice notification to direct FCM device tokens
 */
const sendFcmNoticeNotification = async ({ fcmTokens, notice, sender }) => {
  if (!isFcmConfigured() || !Array.isArray(fcmTokens) || fcmTokens.length === 0) {
    return { success: false, sentCount: 0 };
  }

  try {
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

    const message = {
      tokens: fcmTokens,
      android: {
        priority: 'high',
        notification: {
          channelId: 'school-notices',
          title,
          body,
          sound: 'default',
        },
      },
      data: {
        type: 'notice',
        noticeId: notice._id ? notice._id.toString() : '',
        title: notice.title || '',
        category: notice.category || 'general',
        dateBS: notice.dateBS || '',
      },
    };

    const response = await messagingClient.sendEachForMulticast(message);
    console.log(
      `[FCM] Dispatched Notice to ${response.successCount}/${fcmTokens.length} native devices (failure: ${response.failureCount})`
    );
    return { success: true, sentCount: response.successCount };
  } catch (err) {
    console.warn('[FCM] sendFcmNoticeNotification error:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  isFcmConfigured,
  sendFcmWalkieTalkieDispatch,
  sendFcmNoticeNotification,
};
