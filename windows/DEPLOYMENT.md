# Voice-Flow Deployment Guide

## Client-Server Architecture

Your app uses a **client-server model**:
- **Backend** (stays with you): Runs on your laptop with GPU
- **Electron App** (distribute to users): Lightweight client that connects to your backend

## 📋 Step 1: Add Authorized Users

Edit `backend/allowed_users.txt` and add your users' emails:

```
john@gmail.com
sarah@company.com
mike@example.com
```

**Note**: Users must enter EXACTLY these emails to login!

## 🌐 Step 2: Configure Backend URL

### For Testing (Same WiFi):

1. Find your laptop's local IP:
   ```bash
   ipconfig
   ```
   Look for "IPv4 Address" (e.g., `192.168.1.100`)

2. Create `.env` file in `windows/` folder:
   ```
   BACKEND_URL=http://192.168.1.100:8001
   NODE_ENV=production
   ```

3. Make sure your backend binds to `0.0.0.0` (already configured)

### For Production (Internet Access):

**Option A: Port Forwarding**
1. Set up port forwarding on your router (port 8001)
2. Find your public IP: https://whatismyip.com
3. Update `.env`:
   ```
   BACKEND_URL=http://YOUR_PUBLIC_IP:8001
   NODE_ENV=production
   ```

**Option B: Cloud Deployment**
Deploy backend to AWS/Google Cloud/Azure and update `.env` accordingly.

## 🔧 Step 3: Start Your Backend Server

On your laptop (keep this running):

```bash
cd E:\Yash\PROJECTS\Voice-flow\windows\backend
venv\Scripts\python.exe main.py
```

**Important**: Keep this terminal open! Users connect to this.

## 📦 Step 4: Build the Electron App

Build the installer for users:

```bash
cd E:\Yash\PROJECTS\Voice-flow\windows
npm run build:frontend
npm run dist:win
```

This creates: `app/release/Voice-Flow-Setup-X.X.X.exe`

## 📤 Step 5: Distribute to Users

1. **Send the installer** to your 5-6 users
2. **Give them instructions**:
   - Download and install `Voice-Flow-Setup.exe`
   - Open the app
   - Enter the email you authorized
   - Start using voice transcription!

## 🔐 How Login Works

1. User opens app → sees login page
2. Enters email → app sends to your backend
3. Backend checks `allowed_users.txt`
4. If authorized → user can access the app
5. If not → shows "Access denied"

## ✅ Testing Checklist

Before distributing:

- [ ] Added user emails to `allowed_users.txt`
- [ ] Updated `.env` with your backend IP
- [ ] Backend is running and accessible
- [ ] Built the .exe installer
- [ ] Tested login with valid email
- [ ] Tested login with invalid email (should be denied)
- [ ] Tested voice transcription works
- [ ] Tested long recordings (chunking works)

## 🆘 Troubleshooting

### "Cannot connect to server"
- Check if backend is running
- Check if IP address in `.env` is correct
- Check firewall allows port 8001

### "Access denied"
- Verify email is in `allowed_users.txt`
- Check email spelling (case-insensitive)
- Restart backend after updating `allowed_users.txt`

### Long recordings crash
- Already fixed! Chunking handles 10-15 min recordings

## 📊 Monitor Usage

Your backend terminal shows:
- Who connected (email)
- Transcription requests
- VRAM usage
- Any errors

## 🔄 Adding More Users

1. Edit `backend/allowed_users.txt`
2. Restart backend
3. New users can now login!

## 🎯 Next Steps

Once tested and working:
1. Consider deploying backend to cloud for 24/7 availability
2. Set up automatic backend restart on server reboot
3. Add usage analytics/logging
4. Consider adding user quotas (max transcriptions per day)
