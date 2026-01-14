# Firebase Setup Guide for Voice-Flow

This guide will help you set up Firebase Authentication for Voice-Flow's multi-user support.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add Project**
3. Enter project name: `voice-flow` (or your choice)
4. Disable Google Analytics (optional, not needed)
5. Click **Create Project**

## Step 2: Enable Google Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Click **Google** provider
3. Click **Enable**
4. Set support email (your email)
5. Click **Save**

## Step 3: Get Frontend Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll to **Your apps** section
3. Click **Web app** icon (`</>`)
4. Register app with nickname: `voice-flow-frontend`
5. Copy the `firebaseConfig` object

Create `windows/frontend/.env.local`:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=voice-flow-xxxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=voice-flow-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=voice-flow-xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123...
```

## Step 4: Get Backend Service Account Key

1. In Firebase Console, go to **Project Settings** > **Service Accounts**
2. Click **Generate New Private Key**
3. Click **Generate Key** (downloads JSON file)
4. Save the JSON file as `backend/firebase-credentials.json`
5. **IMPORTANT**: Add this file to `.gitignore` (already done)

Update `backend/.env`:
```env
FIREBASE_CREDENTIALS_PATH=./firebase-credentials.json
```

## Step 5: Verify Setup

### Frontend Test:
```bash
cd windows/frontend
npm install
npm run dev
```

Click "Continue with Google" - should open Google login popup.

### Backend Test:
```bash
cd backend
pip install -r requirements.txt
python main.py
```

Should see: `[AUTH] Firebase Admin SDK initialized successfully`

## Step 6: Production Deployment

### Security Rules:
- Never commit `firebase-credentials.json` to git
- On server, set `FIREBASE_CREDENTIALS_PATH` to absolute path
- Restrict CORS to your frontend domain

### Environment Variables:
```bash
# Backend (.env)
FIREBASE_CREDENTIALS_PATH=/path/to/firebase-credentials.json
DATABASE_URL=sqlite:///./voiceflow.db

# Frontend (.env.local)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_URL=https://your-backend-domain.com
```

## Troubleshooting

### "Firebase credentials not found"
- Check `FIREBASE_CREDENTIALS_PATH` in backend/.env
- Verify file exists at specified path

### "Invalid ID token"
- Frontend and backend must use same Firebase project
- Check `projectId` matches in both configs

### "Popup closed by user"
- User cancelled login (not an error)

### CORS errors
- Update `ALLOWED_ORIGINS` in `backend/main.py`
- Add your frontend URL

## Free Tier Limits

Firebase Authentication is **FREE** with these limits:
- **Unlimited users**
- **Unlimited sign-ins**
- Phone auth: 10K verifications/month (not used)

You won't hit limits for 15-50 users.
