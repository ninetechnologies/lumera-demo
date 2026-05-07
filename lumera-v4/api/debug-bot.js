// Endpoint debug temporaire — diagnostic auth bot Firebase + write Firestore.
// A SUPPRIMER une fois le webhook stable.

import { doc, setDoc } from 'firebase/firestore/lite';
import { getBotDb, getBotAuth, serverTimestamp, WEBHOOK_BOT_UID } from '../lib/firebaseWebhookAuth.js';

export default async function handler(req, res) {
  const report = {
    step: 'init',
    expectedUid: WEBHOOK_BOT_UID,
    env: {
      hasEmail: !!process.env.FIREBASE_BOT_EMAIL,
      hasPassword: !!process.env.FIREBASE_BOT_PASSWORD
    }
  };

  try {
    report.step = 'getBotAuth';
    const auth = await getBotAuth();
    report.auth = {
      hasCurrentUser: !!auth.currentUser,
      uid: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      uidMatches: auth.currentUser?.uid === WEBHOOK_BOT_UID
    };

    if (auth.currentUser) {
      report.step = 'getIdToken';
      const token = await auth.currentUser.getIdToken();
      report.token = {
        present: !!token,
        length: token?.length || 0,
        prefix: token?.slice(0, 20) || null
      };
    }

    report.step = 'getBotDb';
    const db = await getBotDb();
    report.db = { ok: !!db };

    // Test write minimal sur /reservations avec ID synthetique
    const testId = `cs_test_debugbot${Date.now()}`;
    report.step = `setDoc /reservations/${testId}`;
    try {
      await setDoc(doc(db, 'reservations', testId), {
        stripeSessionId: testId,
        prenom: 'DebugBot',
        nom: 'Test',
        email: 'test@debug.local',
        telephone: '0000000000',
        service: 'Studio Podcast',
        duree: '1',
        dateISO: '2099-12-31',
        startHour: 10,
        dureeHours: 1,
        creneau: '10h00',
        slotIds: ['2099-12-31_10-00'],
        prix: 1,
        acompte: 1,
        paid: true,
        projet: 'debug auth bot',
        createdAt: serverTimestamp()
      });
      report.writeReservations = 'OK';
    } catch (e) {
      report.writeReservations = `FAIL: ${e?.code || ''} ${e?.message || e}`;
    }

    // Test write minimal sur /stripe_events
    report.step = 'setDoc /stripe_events';
    try {
      await setDoc(doc(db, 'stripe_events', `evt_debugbot${Date.now()}`), {
        type: 'debug.test',
        sessionId: 'debug',
        receivedAt: serverTimestamp()
      });
      report.writeStripeEvents = 'OK';
    } catch (e) {
      report.writeStripeEvents = `FAIL: ${e?.code || ''} ${e?.message || e}`;
    }

    return res.status(200).json(report);
  } catch (e) {
    report.fatalError = `${e?.code || ''} ${e?.message || e}`;
    return res.status(500).json(report);
  }
}
