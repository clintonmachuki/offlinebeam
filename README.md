# OfflineBeam — file transfer by light

A small static web app that transfers a file from one device to another by showing a looping sequence of QR codes on one screen and reading them with the other device's camera.

## What it does

- Accepts any single file type: photos, videos, audio, ZIP archives, PDFs, and more.
- Splits the selected file into numbered chunks and displays them as QR frames.
- Repeats the frame sequence so the receiving device can collect missed frames on the next pass.
- Reassembles the file in the receiver's browser and checks its SHA-256 digest before offering a download.
- Does not upload or store transferred files on a server. Hosting is only for the app's static files.
- Includes a service worker so the app shell can be cached for offline use after the first visit.

## Important limits

This is a proof-of-concept that uses visible light as a one-way data channel. It is not a fast replacement for Wi-Fi Direct or Bluetooth. At the default speed, even a 1 MB file can take several minutes; big videos may take a very long time. The demo has a 10 MB size limit. It transfers one file at a time.

The file content is not encrypted in this first version. Anyone who can record the entire QR sequence could reconstruct the file, so use it only with files you are comfortable sharing with people who can see the screens.

The app requires two devices with displays and cameras. The receiver needs browser camera permission. Camera access needs HTTPS (or localhost). The scanner library is loaded from jsDelivr on first use and cached by the service worker; visit the hosted site twice while online before trying fully offline, especially on iPhone/Safari. Some Android browsers also provide native QR detection.

## Run locally

From this folder, start a local static server:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in a modern browser. For testing camera access across phones, use a public HTTPS host (GitHub Pages or Netlify) rather than your computer's local address.

## Publish free with GitHub Pages

1. Create a public repository on GitHub, for example `offlinebeam`.
2. Upload all files and folders from this project to the repository root (including `vendor/`, `sw.js`, and `.nojekyll`).
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then Save.
6. Wait for the Pages build to finish. Your site will appear at `https://YOUR-USERNAME.github.io/offlinebeam/`.
7. Open the site on both phones while online. Reload once so the QR scanner library can be cached. Then use **Add to Home Screen** / **Install app** where available.

For a GitHub account on the free plan, the repository must be public. The published site is public too, but it contains only the app code—not transferred files. Never commit private files to this repository.

## Try a transfer

1. Open OfflineBeam on both devices while online, once on each.
2. Reload both devices while still online so the offline cache and scanner library are available.
3. On both devices, open the app again. They can now be disconnected from Wi-Fi and mobile data for the transfer (keep the app already cached/openable).
4. On the sending device, choose a small test photo or text file and tap **Prepare QR stream**.
5. On the receiving device, choose **Receive a file**, tap **Start camera**, and point the camera at the sender's QR square.
6. Leave the sender stream running until the receiver reports **File received successfully**. Save the result.

Tip: increase screen brightness, make the QR square as large as possible, clean both camera lenses, and keep the phones steady about 15–25 cm apart. Use the **Careful** speed if scanning drops frames.

## Browser support

The receiver uses the browser's Barcode Detection API where available, otherwise the bundled app page loads `jsQR` from jsDelivr. The scanner library is cached by the service worker for later offline sessions. If the browser has neither scanner path available, camera scanning will not start. HTTPS is required for camera access on hosted sites.

## Credits

The bundled QR encoder is derived from QRCode.js by Kazuhiko Arase, licensed under MIT; see `vendor/LICENSE-QRCode.txt`. The QR decoder jsQR is loaded from jsDelivr (`jsqr@1.4.0`) at runtime and remains subject to its upstream license.
