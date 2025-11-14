import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";
import AgoraRTC from "agora-rtc-sdk-ng";
import { createClient } from '@supabase/supabase-js';
import './AuthComponent.css'; // Import the new CSS file
// import Dashboard from './Dashboard'; // Temporarily comment out Dashboard import

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([
    { sender: "bot", text: "Hey there! 👋 I'm Eli, your AI Sales Assistant. How can I help u today?" },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);
  const [showDashboardOnly, setShowDashboardOnly] = useState(false); // New state for dashboard toggle
  const [isLeadOnline, setIsLeadOnline] = useState(false); // New state for lead online status
  const [googleAuthMessage, setGoogleAuthMessage] = useState(null); // State for Google Auth messages
  const [isGoogleCalendarConnected, setIsGoogleCalendarConnected] = useState(false); // New state for Google Calendar connection status

  // Agora States
  const [agoraClient, setAgoraClient] = useState(null);
  const [localAudioTrack, setLocalAudioTrack, ] = useState(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [inCall, setInCall] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isTTSActive, setIsTTSActive] = useState(false);
  // STT States
  const [isListening, setIsListening] = useState(false);
  const speechRecognition = useRef(null);
  // Screen Share States
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [localScreenTrack, setLocalScreenTrack] = useState(null);

  // Agora Constants
  const APP_ID = process.env.REACT_APP_AGORA_APP_ID; // <<< IMPORTANT: Replace with your Agora App ID
  const TOKEN = null; // Set to null for now, will be fetched from backend
  const CHANNEL = "main";

  // Supabase Auth and Session Management
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLeadOnline(!!session?.user); // Set lead online status based on session
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLeadOnline(!!session?.user); // Update lead online status on auth change
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Handle Google Auth redirect messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('googleAuthSuccess') === 'true') {
      setGoogleAuthMessage('Google Calendar connected successfully!');
      setIsGoogleCalendarConnected(true); // <--- Add this line
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('googleAuthSuccess') === 'false') {
      setGoogleAuthMessage('Failed to connect Google Calendar.');
      setIsGoogleCalendarConnected(false); // <--- Add this line for consistency, though it's already the default
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // Clear message after some time
    const timer = setTimeout(() => {
      setGoogleAuthMessage(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isGoogleCalendarConnected]); // <--- Add isGoogleCalendarConnected to dependency array

  // Fetch Google Calendar connection status
  useEffect(() => {
    const checkGoogleCalendarStatus = async () => {
      if (user?.id) {
        try {
          const response = await fetch(`http://localhost:5000/auth/google/status?userId=${user.id}`);
          const data = await response.json();
          setIsGoogleCalendarConnected(data.connected);
        } catch (error) {
          console.error("Error fetching Google Calendar status:", error);
          setIsGoogleCalendarConnected(false);
        }
      } else {
        setIsGoogleCalendarConnected(false);
      }
    };
    checkGoogleCalendarStatus();
  }, [user]);

  // Supabase Realtime for Conversations
  useEffect(() => {
    if (user) {
      const conversationSubscription = supabase
        .channel('public:conversations')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'conversations' },
          (payload) => {
            // Only add messages that are NOT from the current user (i.e., from the bot or another agent)
            // This logic assumes the bot is also inserting into the conversations table with a distinct user_id or a null user_id
            // For this setup, we assume the user is interacting via this frontend, and the bot replies are also stored.
            // If the bot_reply is from an insert *not* triggered by this user's sendMessage, then it's an external update.
            // A more robust solution would involve tracking message IDs.
            if (payload.new.user_id !== user.id) { // This condition is to avoid displaying the user's own message from the realtime feed if it's already in local state
              // Add bot reply from the external source
              setMessages((prev) => [
                ...prev,
                { sender: 'bot', text: payload.new.bot_reply }
              ]);
            } else { // This is a message from the current user, ensure the bot reply that just got inserted is also displayed.
              setMessages((prev) => [
                ...prev,
                { sender: 'bot', text: payload.new.bot_reply } // Display the bot's reply for the message just sent by this user.
              ]);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(conversationSubscription);
      };
    }
  }, [user]);

  // Agora Client Initialization (runs once on mount)
  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    setAgoraClient(client);

    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "audio") {
        const audioTrack = user.audioTrack;
        audioTrack.play();
      }
      if (mediaType === "video") {
        setRemoteUsers((prev) => {
          return {
            ...prev,
            [user.uid]: {
              ...prev[user.uid],
              uid: user.uid,
              // Only update videoTrack if it's a camera video
              videoTrack: user.videoTrack && user.videoTrack.trackMediaType === 'camera-video' ? user.videoTrack : prev[user.uid]?.videoTrack,
              // Update screenVideoTrack if it's a screen video
              screenVideoTrack: user.videoTrack && user.videoTrack.trackMediaType === 'screen-video' ? user.videoTrack : prev[user.uid]?.screenVideoTrack,
            },
          };
        });
      }
    });

    client.on("user-unpublished", (user, mediaType) => {
      setRemoteUsers((prev) => {
        const newUsers = { ...prev };

        if (mediaType === "video") {
          // Check if the unpublished user had a screen track
          if (newUsers[user.uid] && newUsers[user.uid].screenVideoTrack && newUsers[user.uid].screenVideoTrack.trackId === user.videoTrack.trackId) {
              newUsers[user.uid].screenVideoTrack = null; // Clear the screen track
          } else if (newUsers[user.uid] && newUsers[user.uid].videoTrack && newUsers[user.uid].videoTrack.trackId === user.videoTrack.trackId) {
              newUsers[user.uid].videoTrack = null; // Clear the camera video track
          }
        }

        // If both video and screen tracks are gone, or if there was only one track and it's gone, remove the user
        if (!newUsers[user.uid]?.videoTrack && !newUsers[user.uid]?.screenVideoTrack && !user.audioTrack) {
            delete newUsers[user.uid];
        }
        return newUsers;
      });
    });

    client.on("user-left", (user) => {
      setRemoteUsers((prev) => {
        const newUsers = { ...prev };
        delete newUsers[user.uid];
        return newUsers;
      });
    });

    return () => {
      client.removeAllListeners();
      if (client && inCall) {
        console.log("Component unmounted, leaving call...");
        client.leave();
      }
    };
  }, [inCall]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      console.warn("Web Speech API not supported by this browser.");
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log("Speech recognition started.");
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      if (transcript.trim()) {
        setInput(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log("Speech recognition ended.");
      setIsListening(false);
    };

    speechRecognition.current = recognition;

    return () => {
      if (speechRecognition.current) {
        speechRecognition.current.stop();
      }
    };
  }, []);

  // Toggle Speech Recognition
  const toggleSpeechRecognition = useCallback(() => {
    if (speechRecognition.current) {
      if (isListening) {
        speechRecognition.current.stop();
      }
      else {
        speechRecognition.current.start();
      }
    }
  }, [isListening]);

  // Join Call
  const joinCall = useCallback(async () => {
    if (!agoraClient || !APP_ID) {
      console.error("Agora client or App ID not initialized.");
      return;
    }

    try {
      const uid = Math.floor(Math.random() * 100000);
      const tokenResponse = await fetch(`http://localhost:3001/agora/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelName: CHANNEL, uid: uid }),
      });
      const { token } = await tokenResponse.json();

      if (!token) {
        console.error("Failed to fetch Agora token.");
        setMessages((prev) => [...prev, { sender: "bot", text: "Failed to join the call: Token missing." }]);
        return;
      }

      await agoraClient.join(APP_ID, CHANNEL, token, uid);

      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      const videoTrack = await AgoraRTC.createCameraVideoTrack();

      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);

      await agoraClient.publish([audioTrack, videoTrack]);

      setInCall(true);
      setIsAudioMuted(false);
      setIsVideoMuted(false);
      setIsSharingScreen(false); // Reset screen sharing on join

      setMessages((prev) => [...prev, { sender: "bot", text: "You have joined the call!" }]);
    }
    catch (error) {
      console.error("Failed to join call:", error);
      setMessages((prev) => [...prev, { sender: "bot", text: "Failed to join the call." }]);
    }
  }, [agoraClient, APP_ID, CHANNEL, setMessages, setInCall, setIsAudioMuted, setIsVideoMuted, setIsSharingScreen]);

  // Leave Call
  const leaveCall = useCallback(async () => {
    if (!agoraClient) return;

    if (localAudioTrack) {
      localAudioTrack.close();
      setLocalAudioTrack(null);
    }
    if (localVideoTrack) {
      localVideoTrack.close();
      setLocalVideoTrack(null);
    }
    if (localScreenTrack) {
      localScreenTrack.close();
      setLocalScreenTrack(null);
      setIsSharingScreen(false);
    }
    setRemoteUsers({});

    await agoraClient.leave();
    setInCall(false);
    setMessages((prev) => [...prev, { sender: "bot", text: "You have left the call." }]);
  }, [agoraClient, localAudioTrack, localVideoTrack, localScreenTrack, setLocalAudioTrack, setLocalVideoTrack, setLocalScreenTrack, setRemoteUsers, setInCall, setMessages, setIsSharingScreen]);

  // Stop Screen Share
  const stopScreenShare = useCallback(async () => {
    if (!agoraClient || !localScreenTrack) return;

    try {
      await agoraClient.unpublish(localScreenTrack);
      localScreenTrack.close();
      setLocalScreenTrack(null);

      const tracksToPublish = [];
      if (localAudioTrack) {
        tracksToPublish.push(localAudioTrack);
      }
      if (localVideoTrack) {
        tracksToPublish.push(localVideoTrack);
      }
      if (tracksToPublish.length > 0) {
        await agoraClient.publish(tracksToPublish);
      }
      
      setIsSharingScreen(false);

      setMessages((prev) => [...prev, { sender: "bot", text: "You have stopped screen sharing." }]);
    }
    catch (error) {
      console.error("Failed to stop screen share:", error);
      setMessages((prev) => [...prev, { sender: "bot", text: "Failed to stop screen sharing." }]);
    }
  }, [agoraClient, localScreenTrack, localAudioTrack, localVideoTrack, setLocalScreenTrack, setIsSharingScreen, setMessages]);

  // Start Screen Share
  const startScreenShare = useCallback(async () => {
    if (!agoraClient || !localAudioTrack || !localVideoTrack) return;

    try {
      const screenTrack = await AgoraRTC.createScreenVideoTrack();
      setLocalScreenTrack(screenTrack);

      const tracksToUnpublish = [];
      if (localAudioTrack) {
        tracksToUnpublish.push(localAudioTrack);
      }
      if (localVideoTrack) {
        tracksToUnpublish.push(localVideoTrack);
      }

      if (tracksToUnpublish.length > 0) {
        await agoraClient.unpublish(tracksToUnpublish);
      }

      await agoraClient.publish(screenTrack);
      setIsSharingScreen(true);

      screenTrack.on("track-ended", () => {
        stopScreenShare();
      });

      setMessages((prev) => [...prev, { sender: "bot", text: "You are now sharing your screen." }]);
    }
    catch (error) {
      console.error("Failed to start screen share:", error);
      setMessages((prev) => [...prev, { sender: "bot", text: "Failed to start screen sharing." }]);
    }
  }, [agoraClient, localAudioTrack, localVideoTrack, setLocalScreenTrack, setIsSharingScreen, setMessages, stopScreenShare]);

  // Toggle Audio
  const toggleAudio = useCallback(async () => {
    if (localAudioTrack) {
      await localAudioTrack.setMuted(!isAudioMuted);
      setIsAudioMuted(!isAudioMuted);
    }
  }, [localAudioTrack, isAudioMuted, setIsAudioMuted]);

  // Toggle Video
  const toggleVideo = useCallback(async () => {
    if (localVideoTrack) {
      await localVideoTrack.setMuted(!isVideoMuted);
      setIsVideoMuted(!isVideoMuted);
    }
  }, [localVideoTrack, isVideoMuted, setIsVideoMuted]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Send message to backend
  const sendMessage = useCallback(async () => {
    if (!input.trim()) return;

    const userMessage = { sender: "user", text: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsTyping(true);

    const formattedMessages = updatedMessages.map(msg => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.text
    }));

    try {
      const response = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: formattedMessages, userId: user?.id }),
      });

      const data = await response.json();
      const botReply = data.reply || "Hmm... something went wrong 🧐";

      setTimeout(() => {
        setMessages((prev) => {
          const newMessages = [...prev, { sender: "bot", text: botReply }];
          if (isTTSActive && botReply !== "No response generated.") {
            const utterance = new SpeechSynthesisUtterance(botReply);
            speechSynthesis.speak(utterance);
          }
          return newMessages;
        });
        setIsTyping(false);
      }, 800);
    }
    catch (error) {
      console.error("Error:", error);
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "⚠️ Sorry, I’m having trouble responding right now." },
      ]);
    }
  }, [input, messages, setMessages, setInput, setIsTyping, isTTSActive, user]);

  // Send on Enter key
  const handleKeyPress = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMessages([
      { sender: "bot", text: "You have been logged out. 👋" },
    ]);
    // Any other cleanup needed on logout
  };

  const toggleDashboardView = () => {
    setShowDashboardOnly(prev => !prev);
  };

  const handleGoogleConnect = () => {
    if (user?.id) {
      window.location.href = `http://localhost:5000/auth/google?userId=${user.id}`;
    } else {
      setGoogleAuthMessage('Please log in to connect Google Calendar.');
    }
  };

  // Framer Motion Variants for containers
  const chatVariants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50, transition: { duration: 0.3 } },
  };

  // Temporarily commented out dashboardVariants for debugging
  /*
  const dashboardVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50, transition: { duration: 0.3 } },
  };
  */

  if (!session) {
    return (
      <div className="App auth-container">
        <header className="App-header">
          <h1>Eli Bot</h1>
        </header>
        <AuthComponent />
      </div>
    );
  }

  return (
    <div className={`App ${showDashboardOnly ? 'dashboard-only' : ''}`}>
      <header className="App-header">
        <h1>Eli Bot</h1>
        <div className="header-controls">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsTTSActive((prev) => !prev)}
            className={`tts-toggle-btn ${isTTSActive ? "active" : ""}`}
          >
            🗣️ TTS {isTTSActive ? "ON" : "OFF"}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleSpeechRecognition}
            className={`stt-toggle-btn ${isListening ? "active" : ""}`}
          >
            🎙️ STT {isListening ? "ON" : "OFF"}
          </motion.button>

          {!inCall ? (
            <motion.button whileTap={{ scale: 0.9 }} onClick={joinCall}>
              Join Call 📞
            </motion.button>
          ) : (
            <div className="call-controls">
              <motion.button whileTap={{ scale: 0.9 }} onClick={toggleAudio}>
                {isAudioMuted ? "🔇" : "🔊"}
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={toggleVideo}>
                {isVideoMuted ? "📷" : "📹"}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={isSharingScreen ? stopScreenShare : startScreenShare}
                className={`screen-share-btn ${isSharingScreen ? "active" : ""}`}
              >
                {isSharingScreen ? "Stop Share 📺" : "Share Screen 🖥️"}
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={leaveCall}>
                Leave Call
              </motion.button>
            </div>
          )}
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={toggleDashboardView}
            className="toggle-dashboard-btn"
          >
            {showDashboardOnly ? "Show Chat" : "Show Dashboard"}
          </motion.button>
          
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={handleGoogleConnect}
            className="google-connect-btn"
          >
            Connect Google Calendar
          </motion.button>

          <motion.p className="google-calendar-status">
            Google Calendar: {isGoogleCalendarConnected ? 'Connected ✅' : 'Not Connected ❌'}
          </motion.p>

          <motion.button whileTap={{ scale: 0.9 }} onClick={handleLogout} className="logout-btn">
            Logout
          </motion.button>
        </div>
        {isLeadOnline && <p className="lead-online-status">🟢 Lead is Online</p>}
        {googleAuthMessage && <motion.p 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="google-auth-message"
        >{googleAuthMessage}</motion.p>}
      </header>

      <div className="main-content-container">
        {/* Only chat-container for now */} 
        <motion.div
          key="chat-container"
          className="chat-container"
          // Reverted inline styles to let CSS handle sizing
          variants={chatVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="messages-display">
            {messages.map((msg, index) => (
              <motion.div
                key={index}
                className={`message ${msg.sender === "user" ? "user-message" : "bot-message"}`}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {msg.text}
              </motion.div>
            ))}
            {isTyping && 
              <motion.div
                className="typing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                Eli is typing...
              </motion.div>
            }
            <div ref={chatEndRef} />
          </div>
          {inCall && (
            <div className="video-streams">
              {localVideoTrack && !isSharingScreen && (
                <VideoPanel
                  uid="local-video"
                  track={localVideoTrack}
                  isLocal={true}
                  isAudioMuted={isAudioMuted}
                  isVideoMuted={isVideoMuted}
                  onToggleAudio={toggleAudio}
                  onToggleVideo={toggleVideo}
                  onLeaveCall={leaveCall}
                />
              )}
              {localScreenTrack && isSharingScreen && (
                <VideoPanel
                  uid="local-screen"
                  track={localScreenTrack}
                  isLocal={true}
                  isAudioMuted={isAudioMuted}
                  isVideoMuted={isVideoMuted}
                  onToggleAudio={toggleAudio}
                  onToggleVideo={toggleVideo}
                  onLeaveCall={leaveCall}
                />
              )}
              {Object.values(remoteUsers).map((user) => (
                <VideoPanel 
                  key={user.uid} 
                  uid={user.uid} 
                  track={user.screenVideoTrack || user.videoTrack}
                  isLocal={false} 
                />
              ))}
            </div>
          )}
          <div className="input-area">
            <input
              className="input-box"
              type="text"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <motion.button
              className="send-btn"
              whileTap={{ scale: 0.9 }}
              onClick={sendMessage}
            >
              ➤
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// A new component for authentication forms
function AuthComponent() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (type) => {
    setLoading(true);
    setMessage('');
    const { error } = type === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(type === 'signup' ? 'Check your email for the confirmation link!' : 'Logged in successfully!');
      setEmail('');
      setPassword('');
    }
    setLoading(false);
  };

  return (
    <div className="auth-form-container">
      <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={() => handleAuth(isLogin ? 'login' : 'signup')} disabled={loading}>
        {loading ? 'Loading...' : (isLogin ? 'Login' : 'Sign Up')}
      </button>
      <button onClick={() => setIsLogin(!isLogin)} disabled={loading}>
        {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
      </button>
      {message && <p className="auth-message">{message}</p>}
    </div>
  );
}

function VideoPanel({ uid, track, isLocal, isAudioMuted, isVideoMuted, onToggleAudio, onToggleVideo, onLeaveCall }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (track && videoRef.current) {
      track.play(videoRef.current);
    }
    return () => {
      if (track) track.stop();
    };
  }, [track]);

  return (
    <div className="video-panel">
      <div ref={videoRef} className="video-player"></div>
      <div className="video-controls">
        {isLocal && (
          <>
            <motion.button whileTap={{ scale: 0.9 }} onClick={onToggleAudio}>
              {isAudioMuted ? "🔇" : "🔊"}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={onToggleVideo}>
              {isVideoMuted ? "📷" : "📹"}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={onLeaveCall}>
              Leave Call
            </motion.button>
          </>
        )}
        {!isLocal && <p>User: {uid}</p>}
      </div>
    </div>
  );
}

export default App;
