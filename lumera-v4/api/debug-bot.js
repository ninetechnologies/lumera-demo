// Endpoint debug temporaire — teste les 2 voies (SDK lite + REST direct).
// A SUPPRIMER une fois le webhook stable.

import { doc, setDoc } from 'firebase/firestore/lite';
import { getBotDb, getBotAuth, serverTimestamp, WEBHOOK_BOT_UID } from '../lib/firebaseWebhookAuth.js';
import { restCreate, getBotUid, nowTimestamp } from '../lib/firestoreRest.js';

export default async function handler(req, res) {
  const report = {
    step: 'init',
    expectedUid: WEBHOOK_BOT_UID,
    env: {
      hasEmail: !!process.env.FIREBASE_BOT_EMAIL,
      hasPassword: !!process.env.FIREBASE_BOT_PASSWORD
    }
  };

  // --- Voie 1 : SDK lite ---
  try {
    const auth = await getBotAuth();
    report.sdk = {
      uid: auth.currentUser?.uid || null,
      uidMatches: auth.currentUser?.uid === WEBHOOK_BOT_UID
    };

    const db = await getBotDb();
    const testId = `cs_test_sdklite${Date.now()}`;
    try {
      await setDoc(doc(db, 'reservations', testId), {
        stripeSessionId: testId,
        prenom: 'SdkLite',
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
        projet: 'debug sdk lite',
        createdAt: serverTimestamp()
      });
      report.sdk.writeReservations = 'OK';
    } catch (e) {
      report.sdk.writeReservations = `FAIL: ${e?.code || ''} ${e?.message || e}`;
    }
  } catch (e) {
    report.sdk = { error: `${e?.code || ''} ${e?.message || e}` };
  }

  // --- Voie 2 : REST direct ---
  try {
    const uid = await getBotUid();
    report.rest = {
      uid,
      uidMatches: uid === WEBHOOK_BOT_UID
    };

    const testId = `cs_test_restdir${Date.now()}`;
    try {
      await restCreate('reservations', testId, {
        stripeSessionId: testId,
        prenom: 'RestDirect',
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
        projet: 'debug rest direct',
        createdAt: nowTimestamp()
      });
      report.rest.writeReservations = 'OK';
    } catch (e) {
      report.rest.writeReservations = `FAIL: ${e?.message || e}`;
    }

    // Test ecriture stripe_events via REST
    try {
      await restCreate('stripe_events', `evt_restdir${Date.now()}`, {
        type: 'debug.test',
        sessionId: 'debug',
        receivedAt: nowTimestamp()
      });
      report.rest.writeStripeEvents = 'OK';
    } catch (e) {
      report.rest.writeStripeEvents = `FAIL: ${e?.message || e}`;
    }

    // Test stripe_processed_sessions via REST
    try {
      await restCreate('stripe_processed_sessions', `cs_test_restdir${Date.now()}`, {
        processedAt: nowTimestamp(),
        eventType: 'debug.test'
      });
      report.rest.writeProcessedSessions = 'OK';
    } catch (e) {
      report.rest.writeProcessedSessions = `FAIL: ${e?.message || e}`;
    }
  } catch (e) {
    report.rest = { error: `${e?.message || e}` };
  }

  return res.status(200).json(report);
}
