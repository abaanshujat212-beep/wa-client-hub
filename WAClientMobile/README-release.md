# Android release checklist

1. Set `API_BASE_URL` to the production HTTPS origin.
2. Configure release keystore outside Git and set Gradle signing variables.
3. Install dependencies with `npm ci`.
4. Run `npx tsc --noEmit` and `npm test -- --runInBand`.
5. Build with `cd android; .\gradlew.bat assembleRelease`.
6. Install the signed APK on a physical device and verify login, workspace selection, Inbox, Contacts, Composer and Calls.
7. Never commit keystores, FCM credentials, access tokens or `.env` files.
