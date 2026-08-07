/**
 * assistantService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Member 4 — AI Civic Assistant Service
 * Handles Voice Recognition (Web Speech API) and AI Chat interactions.
 * Integrates with CivicSync AI backend (/api/chat) and Firestore chat_history.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import api from "../api/axiosInstance";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

// ─── Constants ────────────────────────────────────────────────────────────────
const CHAT_HISTORY_COLLECTION = "chat_history";

const SUPPORTED_LANGUAGES = {
  en: { code: "en-US", label: "English" },
  hi: { code: "hi-IN", label: "Hindi" },
  pa: { code: "pa-IN", label: "Punjabi" },
  bn: { code: "bn-IN", label: "Bengali" },
  te: { code: "te-IN", label: "Telugu" },
};

// ─── Voice Recognition ────────────────────────────────────────────────────────

/**
 * Start voice recognition and return the transcript.
 * @param {string} lang - Language code e.g. "en", "hi"
 * @returns {Promise<string>} - Transcript text from speech
 */
export const startVoiceRecognition = (lang = "en") => {
  return new Promise((resolve, reject) => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      reject(new Error("Speech Recognition is not supported in this browser."));
      return;
    }

    const recognition = new SpeechRecognition();
    const langConfig = SUPPORTED_LANGUAGES[lang] || SUPPORTED_LANGUAGES["en"];

    recognition.lang = langConfig.code;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.start();

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log("[assistantService.startVoiceRecognition] Transcript:", transcript);
      resolve(transcript);
    };

    recognition.onerror = (event) => {
      console.error("[assistantService.startVoiceRecognition] Error:", event.error);
      reject(new Error(`Voice recognition error: ${event.error}`));
    };

    recognition.onnomatch = () => {
      reject(new Error("No speech was recognized. Please try again."));
    };
  });
};

/**
 * Speak a given text using the Web Speech Synthesis API.
 * @param {string} text - Text to speak
 * @param {string} lang - Language code e.g. "en", "hi"
 */
export const speakResponse = (text, lang = "en") => {
  if (!window.speechSynthesis) {
    console.warn("[assistantService.speakResponse] Speech Synthesis not supported.");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const langConfig = SUPPORTED_LANGUAGES[lang] || SUPPORTED_LANGUAGES["en"];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langConfig.code;
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  // Chrome keep-alive: pause/resume every 10s to prevent auto-stop
  const keepAliveInterval = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    } else {
      clearInterval(keepAliveInterval);
    }
  }, 10000);

  utterance.onend = () => clearInterval(keepAliveInterval);
  utterance.onerror = () => clearInterval(keepAliveInterval);

  window.speechSynthesis.speak(utterance);
};

/**
 * Stop any active speech synthesis.
 */
export const stopSpeaking = () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};

// ─── Chat / AI Interaction ────────────────────────────────────────────────────

/**
 * Send a message to the CivicSync AI backend and get a response.
 * Automatically saves the conversation to Firestore chat_history.
 * @param {string} message - User message
 * @param {Object} options - { lang, userId, saveToHistory }
 * @returns {Promise<{ response: string, sources: string[] }>}
 */
export const sendAssistantMessage = async (message, options = {}) => {
  const { lang = "en", userId = null, saveToHistory = true } = options;
  const langCode = SUPPORTED_LANGUAGES[lang]?.code || "en-US";

  let aiResponse = "";
  let sources = [];

  try {
    const { data } = await api.post("/chat", {
      message,
      language: langCode,
    });

    aiResponse = data.response || data.message || "I couldn't process that. Please try again.";
    sources = data.sources || [];
  } catch (err) {
    console.warn("[assistantService.sendAssistantMessage] Backend unavailable, using fallback.", err);
    aiResponse = "I'm currently offline. Please check your connection and try again.";
    sources = [];
  }

  // Save to Firestore chat_history if enabled
  if (saveToHistory) {
    try {
      await saveChatToFirestore({ userId, userMessage: message, aiMessage: aiResponse, lang });
    } catch (firestoreErr) {
      console.warn("[assistantService.sendAssistantMessage] Could not save to Firestore:", firestoreErr);
    }
  }

  return { response: aiResponse, sources };
};

// ─── Firestore: chat_history ──────────────────────────────────────────────────

/**
 * Save a chat exchange (user + AI) to Firestore chat_history collection.
 * @param {Object} params - { userId, userMessage, aiMessage, lang }
 */
export const saveChatToFirestore = async ({ userId, userMessage, aiMessage, lang = "en" }) => {
  const chatDoc = {
    userId: userId || "anonymous",
    userMessage,
    aiMessage,
    language: lang,
    timestamp: serverTimestamp(),
    platform: "civic-assistant",
  };

  const docRef = await addDoc(collection(db, CHAT_HISTORY_COLLECTION), chatDoc);
  console.log("[assistantService.saveChatToFirestore] Saved with ID:", docRef.id);
  return docRef.id;
};

/**
 * Fetch chat history for a user from Firestore.
 * @param {string} userId - User ID (optional, fetches all if not provided)
 * @param {number} maxMessages - Max number of messages to return
 * @returns {Promise<Array>}
 */
export const getChatHistory = async (userId = null, maxMessages = 50) => {
  try {
    const q = query(
      collection(db, CHAT_HISTORY_COLLECTION),
      orderBy("timestamp", "desc"),
      firestoreLimit(maxMessages)
    );

    const snapshot = await getDocs(q);
    const history = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!userId || data.userId === userId) {
        history.push({ id: docSnap.id, ...data });
      }
    });

    return history.reverse(); // Return in chronological order
  } catch (err) {
    console.error("[assistantService.getChatHistory] Error:", err);
    return [];
  }
};

/**
 * Clear all chat history for a user from Firestore.
 * @param {string} userId - User ID
 */
export const clearChatHistory = async (userId = null) => {
  try {
    const q = query(collection(db, CHAT_HISTORY_COLLECTION));
    const snapshot = await getDocs(q);

    const deletePromises = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!userId || data.userId === userId) {
        deletePromises.push(deleteDoc(doc(db, CHAT_HISTORY_COLLECTION, docSnap.id)));
      }
    });

    await Promise.all(deletePromises);
    console.log("[assistantService.clearChatHistory] Cleared", deletePromises.length, "messages.");
  } catch (err) {
    console.error("[assistantService.clearChatHistory] Error:", err);
    throw err;
  }
};

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Check if Speech Recognition is supported in the current browser.
 * @returns {boolean}
 */
export const isSpeechRecognitionSupported = () => {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};

/**
 * Check if Speech Synthesis is supported in the current browser.
 * @returns {boolean}
 */
export const isSpeechSynthesisSupported = () => {
  return !!(window.speechSynthesis);
};

/**
 * Get list of supported languages for the assistant.
 * @returns {Object}
 */
export const getSupportedLanguages = () => SUPPORTED_LANGUAGES;
