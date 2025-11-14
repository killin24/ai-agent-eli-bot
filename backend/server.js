/**
 * AI Sales Agent - Backend Server
 * 
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2025 killin24
 * 
 * This file is part of the AI Sales Agent project.
 * Licensed under the MIT License. See LICENSE file in the project root.
 */
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import pkg from "agora-access-token";
const { RtcTokenBuilder, RtmTokenBuilder, RtcRole, RtmRole } = pkg;
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import multer from 'multer';
import fs from 'fs';
import FormData from 'form-data';

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json()); 

const upload = multer({ dest: 'uploads/' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const googleClient = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

async function getGoogleCalendarClient(userId) {
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    console.error("Error fetching user profile for Google tokens:", error);
    return null;
  }

  const { google_access_token, google_refresh_token, google_token_expiry } = profile;

  if (!google_access_token || !google_refresh_token) {
    console.warn("Google tokens not found for user:", userId);
    return null;
  }

  googleClient.setCredentials({
    access_token: google_access_token,
    refresh_token: google_refresh_token,
    expiry_date: new Date(google_token_expiry).getTime(),
  });

  if (googleClient.isTokenExpiring()) {
    try {
      const { credentials } = await googleClient.refreshAccessToken();
      const { updateError } = await supabase
        .from('user_profiles')
        .update({
          google_access_token: credentials.access_token,
          google_refresh_token: credentials.refresh_token || google_refresh_token,
          google_token_expiry: new Date(credentials.expiry_date),
        })
        .eq('id', userId);

      if (updateError) {
        console.error("Error updating refreshed Google tokens in Supabase:", updateError);
        return null;
      }
      googleClient.setCredentials(credentials);
    } catch (refreshError) {
      console.error("Error refreshing Google access token:", refreshError.message);
      return null;
    }
  }

  return google.calendar({ version: 'v3', auth: googleClient });
}

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(200).json({ message: 'User signed up successfully. Please check your email to confirm your account.', user: data.user });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(200).json({ message: 'User logged in successfully.', user: data.user, session: data.session });
});

app.get('/auth/google', (req, res) => {
  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent',
    state: req.query.userId,
  });
  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state: userId } = req.query;

  if (!code || !userId) {
    return res.status(400).send('Authorization code or user ID missing.');
  }

  try {
    const { tokens } = await googleClient.getToken(code);

    googleClient.setCredentials(tokens);

    const expiry_date = new Date(tokens.expiry_date);

    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: expiry_date,
      })
      .eq('id', userId);

    if (error) {
      console.error("❌ Supabase Update Google Tokens Error:", error);
      return res.status(500).send('Failed to store Google tokens.');
    }

    res.redirect(`http://localhost:3000/dashboard?googleAuthSuccess=true`);
  } catch (error) {
    console.error("❌ Google OAuth Callback Error:", error.message);
    res.status(500).send('Authentication failed.');
  }
});

app.get('/auth/google/status', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('google_access_token, google_refresh_token')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return res.status(200).json({ connected: false, message: 'User profile not found or no Google tokens.' });
    }

    const isConnected = !!(profile.google_access_token && profile.google_refresh_token);
    res.status(200).json({ connected: isConnected, message: isConnected ? 'Google Calendar connected.' : 'Google Calendar not connected.' });
  } catch (error) {
    console.error("❌ Google Calendar Status Check Error:", error.message);
    res.status(500).json({ connected: false, error: 'Failed to check Google Calendar connection status.' });
  }
});

app.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { userId, channel } = req.body || {};
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const form = new FormData();
    form.append('file', fs.createReadStream(file.path));
    form.append('model', 'whisper-1');

    const headers = {
      ...form.getHeaders(),
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    };

    const response = await axios.post('https://openrouter.ai/api/v1/audio/transcriptions', form, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const transcript = response.data?.text || response.data?.transcript || JSON.stringify(response.data);

    try {
      const { data, error } = await supabase
        .from('transcripts')
        .insert([
          {
            user_id: userId || null,
            channel: channel || null,
            transcript: transcript,
            raw_response: response.data,
          },
        ]);

      fs.unlinkSync(file.path);

      if (error) {
        console.error('Supabase insert error:', error);
        return res.status(200).json({ transcript, warning: 'Transcript saved locally but failed to insert to Supabase', supabaseError: error });
      }

      return res.json({ transcript, db: data });
    } catch (dbErr) {
      fs.unlinkSync(file.path);
      console.error('DB error while saving transcript:', dbErr);
      return res.status(500).json({ error: 'Transcription succeeded but saving to DB failed', detail: dbErr.message });
    }
  } catch (error) {
    console.error('Transcription error:', error.response ? error.response.data : error.message);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(500).json({ error: 'Transcription failed', detail: error.response ? error.response.data : error.message });
  }
});

const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

app.post("/chat", async (req, res) => {
  try {
    const { messages, userId } = req.body;
    if (!messages || messages.length === 0) return res.status(400).json({ error: "Messages array is required" });
    if (!userId) return res.status(400).json({ error: "User ID is required." });

    const lastUserMessage = messages[messages.length - 1].content;
    const lowerCaseMessage = lastUserMessage.toLowerCase();

    let botReply = "";

    if (lowerCaseMessage.includes("who created you")) {
      botReply = "I was created by the team ByteKnights. Members were Pranav Sharma, Kashvi Pratap Singh, and Kush Arora.";
      console.log("🧠 Bot Creator Reply:", botReply);
    } else if (lowerCaseMessage.includes("your name") || lowerCaseMessage.includes("who are you") || lowerCaseMessage.includes("what is your name")) {
      botReply = "My name is Eli.";
      console.log("🧠 Bot Name Reply:", botReply);
    } else {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-3.5-turbo",
          messages: messages,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      botReply = response.data.choices[0].message.content || "No response generated.";
      console.log("🧠 OpenRouter reply:", botReply);
    }

    const qualificationPrompt = `Analyze the user's intent from the following message. Based on their interest level in a product or service, respond with ONLY 'Qualified' or 'Not Qualified'.\n\nQualified Examples:\n- "I want to talk about business."\n- "I'm interested in purchasing your software."\n- "Can you tell me more about your pricing plans?"\n- "I'd like to schedule a demo."\n\nNot Qualified Examples:\n- "Hi"\n- "How are you?"\n- "Tell me a joke."\n- "I want advice."\n\nUser message: "${lastUserMessage}"`;
    const qualificationResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are an expert lead qualification specialist. Your only task is to classify user messages as 'Qualified' or 'Not Qualified' based on their expressed interest in a product or service. Do not elaborate or provide any other text." },
          { role: "user", content: qualificationPrompt }
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    const leadQualification = qualificationResponse.data.choices[0].message.content.trim();
    console.log("📊 Lead Qualification:", leadQualification);

    let finalBotReply = botReply;

    if (leadQualification === "Qualified") {
      finalBotReply += "\n\nGreat news! Based on our conversation, you appear to be a qualified lead. Would you like me to help you schedule a follow-up meeting?";
    }

    const sentimentPrompt = `Analyze the sentiment of the following user message. Respond with ONLY 'Positive', 'Negative', or 'Neutral'. User message: "${lastUserMessage}"`;
    const sentimentResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a sentiment analysis expert. Your task is to analyze the sentiment of the user's message and respond with ONLY 'Positive', 'Negative', or 'Neutral'. Do not elaborate or provide any other text." },
          { role: "user", content: sentimentPrompt }
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    const sentiment = sentimentResponse.data.choices[0].message.content.trim();
    console.log("😄 Sentiment:", sentiment);

    const chatLogSummaryPrompt = `Summarize the following conversation for a quick overview. User message: "${lastUserMessage}" | Bot reply: "${finalBotReply}"`;
    const chatLogSummaryResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a conversation summarization expert. Your task is to provide a concise summary of the given chat messages. Do not elaborate or provide any other text." },
          { role: "user", content: chatLogSummaryPrompt }
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    const summary = chatLogSummaryResponse.data.choices[0].message.content.trim();
    console.log("📝 Conversation Summary:", summary);

    const { data: conversationData, error: conversationError } = await supabase
      .from('conversations')
      .insert([
        {
          user_id: userId,
          user_message: lastUserMessage,
          bot_reply: finalBotReply,
          lead_qualification: leadQualification,
          sentiment: sentiment,
          summary: summary,
          full_chat_log: messages,
        },
      ]);

    if (conversationError) {
      console.error("❌ Supabase Conversation Insert Error:", conversationError);
      return res.status(500).json({ error: "Failed to save conversation." });
    }

    res.json({ reply: finalBotReply, conversationId: conversationData ? conversationData[0].id : null });
  } catch (error) {
    console.error("❌ OpenRouter Error or other backend issue:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: "Something went wrong with the chat processing." });
  }
});

app.get("/conversations", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error("❌ Supabase Fetch Conversations Error:", error);
      return res.status(500).json({ error: "Failed to retrieve conversations." });
    }

    res.json(data);
  } catch (error) {
    console.error("❌ Get Conversations Error:", error);
    res.status(500).json({ error: "Failed to retrieve conversations." });
  }
});

app.post("/meetings", async (req, res) => {
  try {
    const { userId, title, description, meeting_date, meeting_time } = req.body;

    if (!userId || !title || !meeting_date || !meeting_time) {
      return res.status(400).json({ error: "User ID, title, date, and time are required to schedule a meeting." });
    }

    let googleCalendarEventId = null;

    const calendar = await getGoogleCalendarClient(userId);
    if (calendar) {
      try {
        const event = {
          summary: title,
          description: description || 'Meeting scheduled via AI Sales Agent',
          start: {
            dateTime: `${meeting_date}T${meeting_time}:00`,
            timeZone: 'America/Los_Angeles',
          },
          end: {
            dateTime: `${meeting_date}T${meeting_time}:00`,
            timeZone: 'America/Los_Angeles',
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 60 },
              { method: 'popup', minutes: 15 },
            ],
          },
        };

        const response = await calendar.events.insert({
          calendarId: 'primary',
          resource: event,
        });
        googleCalendarEventId = response.data.id;
        console.log("📅 Google Calendar event created:", googleCalendarEventId);
      } catch (calendarError) {
        console.error("❌ Google Calendar Event Creation Error:", calendarError.message);
      }
    }

    const { data, error } = await supabase
      .from('meetings')
      .insert([
        {
          user_id: userId,
          title,
          description,
          meeting_date,
          meeting_time,
          google_calendar_event_id: googleCalendarEventId,
          status: 'scheduled',
        },
      ]);

    if (error) {
      console.error("❌ Supabase Insert Meeting Error:", error);
      return res.status(500).json({ error: "Failed to schedule meeting." });
    }

    res.status(201).json({ message: "Meeting scheduled successfully!", meeting: data[0] });
  } catch (error) {
    console.error("❌ Schedule Meeting Error:", error);
    res.status(500).json({ error: "Something went wrong while scheduling the meeting." });
  }
});

app.get("/meetings", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }

    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('user_id', userId)
      .order('meeting_date', { ascending: true })
      .order('meeting_time', { ascending: true });

    if (error) {
      console.error("❌ Supabase Fetch Meetings Error:", error);
      return res.status(500).json({ error: "Failed to retrieve meetings." });
    }

    res.json(data);
  } catch (error) {
    console.error("❌ Get Meetings Error:", error);
    res.status(500).json({ error: "Failed to retrieve meetings." });
  }
});

app.get("/agora-token", (req, res) => {
  const channelName = req.query.channel;
  let uid = req.query.uid;
  if (!channelName || !uid) {
    return res.status(400).json({ error: "channel and uid are required" });
  }

  uid = parseInt(uid, 10);

  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    return res.status(500).json({ error: "Agora App ID or Certificate not configured" });
  }

  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    role,
    privilegeExpiredTs
  );

  res.json({ token });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
