// Localhost is ALWAYS isolated. Never fall back to the production database.
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, connectAuthEmulator, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { APP_CHECK_SITE_KEY } from './security-config.js';
export const localTest = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const config = localTest ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-wsb-local' } : {
  apiKey: 'AIzaSyDUWKr1e9ZIcW0iCr08ykhTvmCqEcr2qGI', authDomain: 'wsb-esports.firebaseapp.com', projectId: 'wsb-esports',
  storageBucket: 'wsb-esports.firebasestorage.app', messagingSenderId: '999242676867', appId: '1:999242676867:web:64488c17d1109c5d03f9b6'
};
export const app = getApps().find(a => a.name === (localTest ? 'wsb-local' : '[DEFAULT]')) || initializeApp(config, localTest ? 'wsb-local' : '[DEFAULT]');
if (!localTest && APP_CHECK_SITE_KEY) {
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js');
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
export const auth = getAuth(app), db = getFirestore(app), provider = new GoogleAuthProvider();
if (localTest) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8186);
  document.documentElement.classList.add('local-testing');
  const banner = document.createElement('aside'); banner.className = 'local-test-banner';
  banner.textContent = 'LOCAL TEST SITE · Test accounts and data only. Production is unchanged.';
  document.body.prepend(banner);
  document.querySelectorAll('#adminGoogleSignIn, #googleSignIn, #bountySignIn').forEach(button => {
    button.disabled = true; button.textContent = 'USE A LOCAL TEST ACCOUNT';
    button.title = 'Choose a fake account on the local Admin or My profile page. Real Google sign-in is used only on the deployed site.';
  });
}
export const authReady = setPersistence(auth, browserLocalPersistence);
// No App Check debug credential is ever shipped to production.
