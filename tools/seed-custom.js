/* Data demo Kirim Doa (dev server sahaja): satu pautan Kumpul Doa untuk pengguna demo. */
'use strict';
module.exports = function ({ api, ok, user }) {
  ok(api({ action: 'recipient.create', token: user.token, payload: { displayName: 'Nur Aisyah', title: 'Doakan umrah saya', occasion: 'UMRAH' } }));
};
