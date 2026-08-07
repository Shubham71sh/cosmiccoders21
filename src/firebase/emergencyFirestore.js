/**
 * emergencyFirestore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Member 4 — Firestore queries for Emergency & Shelter data
 * Collections: `emergency_alerts`, `shelters`, `chat_history`
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Collection Names ─────────────────────────────────────────────────────────
const COLLECTIONS = {
  EMERGENCY_ALERTS: "emergency_alerts",
  SHELTERS: "shelters",
  CHAT_HISTORY: "chat_history",
};

// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY ALERTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new emergency alert in Firestore.
 * @param {Object} alertData - Alert fields
 * @returns {Promise<string>} - Document ID of the created alert
 */
export const createEmergencyAlert = async (alertData) => {
  const payload = {
    ...alertData,
    status: alertData.status || "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, COLLECTIONS.EMERGENCY_ALERTS), payload);
  console.log("[emergencyFirestore.createEmergencyAlert] Created alert ID:", docRef.id);
  return docRef.id;
};

/**
 * Fetch a single emergency alert by ID.
 * @param {string} alertId
 * @returns {Promise<Object|null>}
 */
export const getEmergencyAlertById = async (alertId) => {
  try {
    const docRef = doc(db, COLLECTIONS.EMERGENCY_ALERTS, alertId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.warn("[emergencyFirestore.getEmergencyAlertById] Alert not found:", alertId);
      return null;
    }

    return { id: docSnap.id, ...docSnap.data() };
  } catch (err) {
    console.error("[emergencyFirestore.getEmergencyAlertById] Error:", err);
    return null;
  }
};

/**
 * Fetch all emergency alerts (optionally filtered by status).
 * @param {string|null} status - "active" | "resolved" | "pending" | null for all
 * @param {number} maxResults - Max number of results
 * @returns {Promise<Array>}
 */
export const getAllEmergencyAlerts = async (status = null, maxResults = 30) => {
  try {
    let q;

    if (status) {
      q = query(
        collection(db, COLLECTIONS.EMERGENCY_ALERTS),
        where("status", "==", status),
        orderBy("createdAt", "desc"),
        firestoreLimit(maxResults)
      );
    } else {
      q = query(
        collection(db, COLLECTIONS.EMERGENCY_ALERTS),
        orderBy("createdAt", "desc"),
        firestoreLimit(maxResults)
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[emergencyFirestore.getAllEmergencyAlerts] Error:", err);
    return [];
  }
};

/**
 * Fetch emergency alerts for a specific user.
 * @param {string} userId
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
export const getAlertsByUser = async (userId, maxResults = 20) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.EMERGENCY_ALERTS),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      firestoreLimit(maxResults)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[emergencyFirestore.getAlertsByUser] Error:", err);
    return [];
  }
};

/**
 * Fetch emergency alerts by type (flood, earthquake, etc).
 * @param {string} type
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
export const getAlertsByType = async (type, maxResults = 20) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.EMERGENCY_ALERTS),
      where("type", "==", type),
      where("status", "==", "active"),
      orderBy("createdAt", "desc"),
      firestoreLimit(maxResults)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[emergencyFirestore.getAlertsByType] Error:", err);
    return [];
  }
};

/**
 * Update an emergency alert's fields.
 * @param {string} alertId
 * @param {Object} updates - Fields to update
 */
export const updateEmergencyAlert = async (alertId, updates) => {
  try {
    const alertRef = doc(db, COLLECTIONS.EMERGENCY_ALERTS, alertId);
    await updateDoc(alertRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    console.log("[emergencyFirestore.updateEmergencyAlert] Updated alert:", alertId);
  } catch (err) {
    console.error("[emergencyFirestore.updateEmergencyAlert] Error:", err);
    throw err;
  }
};

/**
 * Resolve (close) an emergency alert.
 * @param {string} alertId
 */
export const resolveEmergencyAlert = async (alertId) => {
  return updateEmergencyAlert(alertId, { status: "resolved" });
};

/**
 * Delete an emergency alert from Firestore.
 * @param {string} alertId
 */
export const deleteEmergencyAlert = async (alertId) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.EMERGENCY_ALERTS, alertId));
    console.log("[emergencyFirestore.deleteEmergencyAlert] Deleted alert:", alertId);
  } catch (err) {
    console.error("[emergencyFirestore.deleteEmergencyAlert] Error:", err);
    throw err;
  }
};

/**
 * Real-time listener for active emergency alerts.
 * @param {Function} onUpdate - Callback with updated alerts array
 * @param {Function} onError - Callback on error
 * @returns {Function} - Unsubscribe function
 */
export const subscribeToActiveAlerts = (onUpdate, onError = console.error) => {
  const q = query(
    collection(db, COLLECTIONS.EMERGENCY_ALERTS),
    where("status", "==", "active"),
    orderBy("createdAt", "desc"),
    firestoreLimit(20)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const alerts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      onUpdate(alerts);
    },
    onError
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SHELTERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all active shelters from Firestore.
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
export const getAllShelters = async (maxResults = 30) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.SHELTERS),
      where("isActive", "==", true),
      firestoreLimit(maxResults)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[emergencyFirestore.getAllShelters] Error:", err);
    return [];
  }
};

/**
 * Fetch a single shelter by ID.
 * @param {string} shelterId
 * @returns {Promise<Object|null>}
 */
export const getShelterById = async (shelterId) => {
  try {
    const docRef = doc(db, COLLECTIONS.SHELTERS, shelterId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() };
  } catch (err) {
    console.error("[emergencyFirestore.getShelterById] Error:", err);
    return null;
  }
};

/**
 * Fetch shelters that support a specific disaster type.
 * @param {string} disasterType
 * @returns {Promise<Array>}
 */
export const getSheltersByDisasterType = async (disasterType) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.SHELTERS),
      where("supportedDisasters", "array-contains", disasterType),
      where("isActive", "==", true),
      firestoreLimit(15)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[emergencyFirestore.getSheltersByDisasterType] Error:", err);
    return [];
  }
};

/**
 * Fetch shelters filtered by available capacity.
 * @param {number} minCapacity - Minimum available slots
 * @returns {Promise<Array>}
 */
export const getSheltersWithCapacity = async (minCapacity = 1) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.SHELTERS),
      where("isActive", "==", true),
      where("availableCapacity", ">=", minCapacity),
      orderBy("availableCapacity", "desc"),
      firestoreLimit(20)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[emergencyFirestore.getSheltersWithCapacity] Error:", err);
    return [];
  }
};

/**
 * Add a new shelter to Firestore.
 * @param {Object} shelterData
 * @returns {Promise<string>} - Shelter document ID
 */
export const addShelter = async (shelterData) => {
  const payload = {
    ...shelterData,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, COLLECTIONS.SHELTERS), payload);
  return docRef.id;
};

/**
 * Update a shelter's available capacity.
 * @param {string} shelterId
 * @param {number} newCapacity
 */
export const updateShelterCapacity = async (shelterId, newCapacity) => {
  try {
    const shelterRef = doc(db, COLLECTIONS.SHELTERS, shelterId);
    await updateDoc(shelterRef, {
      availableCapacity: newCapacity,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[emergencyFirestore.updateShelterCapacity] Error:", err);
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHAT HISTORY (Emergency Assistant Conversations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a chat message to the chat_history collection.
 * @param {Object} chatData - { userId, userMessage, aiMessage, lang, context }
 * @returns {Promise<string>} - Document ID
 */
export const saveChatMessage = async (chatData) => {
  const payload = {
    userId: chatData.userId || "anonymous",
    userMessage: chatData.userMessage,
    aiMessage: chatData.aiMessage,
    language: chatData.lang || "en",
    context: chatData.context || "emergency-assistant",
    timestamp: serverTimestamp(),
    createdAt: new Date().toISOString(),
  };

  const docRef = await addDoc(collection(db, COLLECTIONS.CHAT_HISTORY), payload);
  return docRef.id;
};

/**
 * Fetch chat history for a user.
 * @param {string} userId
 * @param {number} maxMessages
 * @returns {Promise<Array>}
 */
export const getChatHistoryByUser = async (userId, maxMessages = 50) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.CHAT_HISTORY),
      where("userId", "==", userId),
      orderBy("timestamp", "desc"),
      firestoreLimit(maxMessages)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .reverse(); // Chronological order
  } catch (err) {
    console.error("[emergencyFirestore.getChatHistoryByUser] Error:", err);
    return [];
  }
};

/**
 * Fetch all recent chat history (admin view).
 * @param {number} maxMessages
 * @returns {Promise<Array>}
 */
export const getAllChatHistory = async (maxMessages = 100) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.CHAT_HISTORY),
      orderBy("timestamp", "desc"),
      firestoreLimit(maxMessages)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[emergencyFirestore.getAllChatHistory] Error:", err);
    return [];
  }
};

/**
 * Delete a specific chat message.
 * @param {string} messageId
 */
export const deleteChatMessage = async (messageId) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.CHAT_HISTORY, messageId));
  } catch (err) {
    console.error("[emergencyFirestore.deleteChatMessage] Error:", err);
    throw err;
  }
};

/**
 * Clear all chat history for a user.
 * @param {string} userId
 */
export const clearUserChatHistory = async (userId) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.CHAT_HISTORY),
      where("userId", "==", userId)
    );

    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map((d) =>
      deleteDoc(doc(db, COLLECTIONS.CHAT_HISTORY, d.id))
    );

    await Promise.all(deletePromises);
    console.log("[emergencyFirestore.clearUserChatHistory] Cleared", deletePromises.length, "messages for user:", userId);
  } catch (err) {
    console.error("[emergencyFirestore.clearUserChatHistory] Error:", err);
    throw err;
  }
};

// ─── Export Collection Names for reference ────────────────────────────────────
export { COLLECTIONS };
