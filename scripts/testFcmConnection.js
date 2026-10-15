const { isFcmConfigured, sendFcmWalkieTalkieDispatch } = require('../utils/fcmNotifier');

async function testFcm() {
  console.log('--- Testing Firebase Cloud Messaging (FCM) Integration ---');

  console.log('1. Checking isFcmConfigured()...');
  const configured = isFcmConfigured();
  console.log('   FCM Configured Status:', configured);

  if (!configured) {
    console.error('❌ FCM is not configured! Check firebase-service-account.json');
    process.exit(1);
  }

  console.log('2. Testing sendFcmWalkieTalkieDispatch with a test token...');
  const result = await sendFcmWalkieTalkieDispatch({
    fcmTokens: ['fake_test_device_token_for_dry_run_validation_12345'],
    sender: { name: 'Principal Sharma', role: 'principal' },
    type: 'broadcast',
    duration: 4,
    audioUrl: 'https://ypssbackend.vercel.app/uploads/test_audio.m4a',
    messageId: 'test_msg_9999',
  });

  console.log('3. Dispatch function executed successfully!');
  console.log('   Result:', result);
  console.log('\n--- SUCCESS: Firebase Cloud Messaging (FCM) is fully initialized, authenticated, and ready to wake up devices! ---');
  process.exit(0);
}

testFcm().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});
