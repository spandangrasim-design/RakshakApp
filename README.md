# RakshakApp

Rakshak security operations platform. The repository contains the web administration console, the authenticated guard mobile app, the no-password field app, and the backend/API source.

## Run the redesigned applications

### Web administration console

```bash
cd frontend
cp .env.production.example .env.production
# Set VITE_API_URL to the API base URL for your environment
npm ci
npm run dev
```

For a production bundle, run `npm run build` from `frontend/`.

### Guard mobile app (Flutter)

```bash
cd rakshak_mobile
flutter pub get
flutter run
```

### Field app (Flutter)

```bash
cd rakshak_field
flutter pub get
flutter run
```

Both Flutter projects now include the Rakshak brand image under `assets/branding/` and register it in `pubspec.yaml`. Run `flutter pub get` after updating the source so Flutter refreshes its asset manifest.

## Environment configuration

The real `.env` and `frontend/.env.production` files are intentionally not included in this redesigned archive. Use `.env.example` and `frontend/.env.production.example` as safe templates, then restore the correct values from your secret manager or deployment environment. Do not commit real credentials.

## Redesign scope

See [REDESIGN_NOTES.md](REDESIGN_NOTES.md) for the screens and visual-system changes. Backend services, database SQL, API endpoints, role checks, tenant branding, and permission gates were not intentionally changed.
