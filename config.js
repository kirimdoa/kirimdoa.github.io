/**
 * Tetapan versi web (GitHub Pages / domain sendiri). BUKAN rahsia — semua nilai di sini memang awam.
 * Fail ini dimuatkan oleh halaman DAN service worker (sebab itu guna `self`, bukan `window`).
 */
self.KIRIM_DOA_CONFIG = {
  // URL Web App (Deploy → Manage deployments) yang berakhir dengan /exec
  webAppUrl: 'https://script.google.com/macros/s/AKfycbxVQdBEj62srAflj1xiIUgtA3blxlo4U-OSlQRhtNKqqN_qr3_HXggHX5gKMgAB_i8n/exec',

  // Notifikasi telefon — Firebase projek kirimdoa-ce350
  firebase: {
    apiKey: 'AIzaSyBga7SaC79SMs4QVgI3TDfFTgeu7l2anxA',
    authDomain: 'kirimdoa-ce350.firebaseapp.com',
    projectId: 'kirimdoa-ce350',
    messagingSenderId: '1070213708472',
    appId: '1:1070213708472:web:1ca26dd3ba147bc7ae924d'
  },
  // Cloud Messaging → Web Push certificates → Key pair
  vapidKey: 'BJpb_xPdtqfrTAWysPdvMfsVxdEHZop11BJRJ4IewNM_RnbRAndIFkANwL4TAqHxQjE_zJj3cNAN59-2REfECu0'
};
