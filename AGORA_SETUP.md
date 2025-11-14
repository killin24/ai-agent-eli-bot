# Agora SDK Setup Guide

## Overview
Agora SDK is already installed in your project (`agora-rtc-sdk-ng`). This guide shows how to configure and use it.

## Step 1: Get Your Agora Credentials

1. **Create an Agora Account**
   - Visit: https://www.agora.io/
   - Sign up for a free account

2. **Create a Project**
   - Go to Agora Console: https://console.agora.io/
   - Create a new project
   - Copy your **App ID** (you'll need this)

3. **Get a Token (Optional for testing)**
   - For production: Generate tokens server-side from your backend
   - For testing: You can use App ID without token (set TOKEN to null)

## Step 2: Configure Environment Variables

Create a `.env` file in your frontend folder:

```bash
cd c:\Users\lawye\Desktop\ai-sales-agent\frontend\ai-sales-frontend
```

Create `.env` file with:
```
REACT_APP_AGORA_APP_ID=YOUR_AGORA_APP_ID_HERE
```

Replace `YOUR_AGORA_APP_ID_HERE` with your actual App ID from Agora Console.

## Step 3: Agora Features Already Implemented

Your app already has these Agora features:

### ✅ Audio/Video Calling
- **Join Call**: Starts audio and video
- **Toggle Audio**: Mute/unmute microphone
- **Toggle Video**: Turn camera on/off
- **Leave Call**: Disconnect from call

### ✅ Screen Sharing
- **Share Screen**: Share your screen during call
- **Stop Share**: Stop screen sharing

### ✅ Remote User Management
- Subscribe to remote users' audio/video
- Handle user leave events
- Display multiple video streams

## Step 4: Key Functions in App.js

### Initialize Agora Client
```javascript
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
```

### Join a Call
```javascript
const joinCall = async () => {
  // Creates local audio/video tracks
  // Joins the channel
  // Publishes tracks to Agora
};
```

### Send/Receive Messages
```javascript
// Messages work through your backend/Supabase
// Audio/video works through Agora SDK
```

## Step 5: Backend Integration (Optional)

For production, generate tokens server-side:

```javascript
// Backend endpoint example (Node.js)
app.get("/token", async (req, res) => {
  const uid = req.query.uid;
  const channelName = req.query.channel;
  
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    Math.floor(new Date().getTime() / 1000) + 3600
  );
  
  res.json({ token: token });
});
```

Then in your App.js:
```javascript
const TOKEN = await fetch(`http://localhost:5000/token?uid=1&channel=main`)
  .then(res => res.json())
  .then(data => data.token);
```

## Step 6: Test the Integration

1. Start your React app:
   ```bash
   npm start
   ```

2. Open two browser tabs (or two devices on same network)

3. Both should be able to:
   - Join the call
   - See/hear each other
   - Toggle audio/video
   - Share screen

## Step 7: Troubleshooting

### Issue: "App ID is required"
- Make sure you added `REACT_APP_AGORA_APP_ID` to `.env`
- Restart React dev server after adding env vars

### Issue: "User not found"
- Make sure you're in the same channel name
- Check browser console for errors

### Issue: "No audio/video coming through"
- Check browser permissions for microphone/camera
- Ensure devices are connected
- Check Agora Console for resource usage

### Issue: Can't see remote video
- Ensure remote user has video enabled
- Check network connectivity
- Verify both users in same channel

## Current File Structure

```
src/
├── App.js (contains all Agora integration)
├── App.css (styling for video panels)
└── index.js (entry point)
```

## API Reference

Common Agora SDK methods used in your app:

```javascript
// Create client
AgoraRTC.createClient({ mode: "rtc", codec: "vp8" })

// Create local tracks
AgoraRTC.createMicrophoneAudioTrack()
AgoraRTC.createCameraVideoTrack()
AgoraRTC.getScreenShareAudioTrack()
AgoraRTC.getDisplayMedia({ video: { cursor: "always" } })

// Client methods
client.join(appId, channel, token, uid)
client.publish([audioTrack, videoTrack])
client.subscribe(remoteUser, mediaType)
client.leave()

// Track methods
track.play()
track.stop()
track.close()
track.setMuted(true/false)
```

## Next Steps

1. ✅ Add your App ID to `.env`
2. ✅ Test with two browser windows
3. ✅ Implement token generation on backend
4. ✅ Add more features (recording, transcoding, etc.)
5. ✅ Deploy to production

## Resources

- Agora Docs: https://docs.agora.io/
- React SDK Guide: https://docs.agora.io/en/video-calling/reference/react-sdk
- RTC API Reference: https://docs.agora.io/en/video-calling/reference/rtc-web
- Community: https://www.agora.io/en/community/

## Support

For issues or questions:
- Agora Support: support@agora.io
- Developer Forum: https://forums.agora.io/
