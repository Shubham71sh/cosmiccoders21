/**
 * emergencyService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Member 4 — Emergency Notification Dispatcher
 * Handles SOS alerts, geolocation-based emergency dispatch,
 * shelter lookup, and real-time emergency notifications.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import api from "../api/axiosInstance";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

// ─── Constants ────────────────────────────────────────────────────────────────
const EMERGENCY_ALERTS_COLLECTION = "emergency_alerts";
const SHELTERS_COLLECTION = "shelters";

export const EMERGENCY_TYPES = {
  FLOOD: "flood",
  EARTHQUAKE: "earthquake",
  FIRE: "fire",
  CYCLONE: "cyclone",
  LANDSLIDE: "landslide",
  DROUGHT: "drought",
  MEDICAL: "medical",
  OTHER: "other",
};

export const ALERT_STATUS = {
  ACTIVE: "active",
  RESOLVED: "resolved",
  PENDING: "pending",
  DISPATCHED: "dispatched",
};

export const SEVERITY_LEVELS = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

// ─── Geolocation ──────────────────────────────────────────────────────────────

/**
 * Get the user's current GPS coordinates.
 * @returns {Promise<{ lat: number, lng: number }>}
 */
export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.error("[emergencyService.getCurrentLocation] Error:", error);
        reject(new Error(`Location error: ${error.message}`));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};

// ─── SOS Alert ────────────────────────────────────────────────────────────────

/**
 * Send an SOS emergency alert — saves to Firestore and notifies backend.
 * @param {Object} params - { userId, type, severity, description, location, contactNumber }
 * @returns {Promise<{ alertId: string, status: string }>}
 */
export const sendSOSAlert = async (params) => {
  const {
    userId = "anonymous",
    type = EMERGENCY_TYPES.OTHER,
    severity = SEVERITY_LEVELS.HIGH,
    description = "Emergency SOS triggered",
    location = null,
    contactNumber = null,
  } = params;

  // Try to get location automatically if not provided
  let alertLocation = location;
  if (!alertLocation) {
    try {
      alertLocation = await getCurrentLocation();
    } catch {
      alertLocation = { lat: null, lng: null, accuracy: null };
      console.warn("[emergencyService.sendSOSAlert] Could not get location.");
    }
  }

  const alertPayload = {
    userId,
    type,
    severity,
    description,
    location: alertLocation,
    contactNumber,
    status: ALERT_STATUS.ACTIVE,
    timestamp: serverTimestamp(),
    createdAt: new Date().toISOString(),
    isSOSTriggered: true,
  };

  let alertId = null;

  // 1. Save to Firestore emergency_alerts
  try {
    const docRef = await addDoc(collection(db, EMERGENCY_ALERTS_COLLECTION), alertPayload);
    alertId = docRef.id;
    console.log("[emergencyService.sendSOSAlert] Firestore alert created:", alertId);
  } catch (firestoreErr) {
    console.error("[emergencyService.sendSOSAlert] Firestore error:", firestoreErr);
  }

  // 2. Notify backend
  try {
    await api.post("/emergency/sos", {
      alertId,
      ...alertPayload,
      location: alertLocation,
    });
    console.log("[emergencyService.sendSOSAlert] Backend notified.");
  } catch (apiErr) {
    console.warn("[emergencyService.sendSOSAlert] Backend notification failed (offline mode):", apiErr);
  }

  return { alertId, status: ALERT_STATUS.ACTIVE };
};

// ─── Emergency Notifications ──────────────────────────────────────────────────

/**
 * Dispatch an emergency notification to nearby users or officials.
 * @param {Object} params - { alertId, radius, message, type }
 * @returns {Promise<{ dispatched: boolean, recipientCount: number }>}
 */
export const dispatchEmergencyNotification = async (params) => {
  const { alertId, radius = 10, message, type = EMERGENCY_TYPES.OTHER } = params;

  try {
    const { data } = await api.post("/emergency/dispatch", {
      alertId,
      radius,
      message,
      type,
    });

    return {
      dispatched: true,
      recipientCount: data.recipientCount || 0,
      message: data.message || "Notification dispatched successfully.",
    };
  } catch (err) {
    console.error("[emergencyService.dispatchEmergencyNotification] Error:", err);
    return { dispatched: false, recipientCount: 0, message: "Failed to dispatch notification." };
  }
};

// ─── Firestore: emergency_alerts ─────────────────────────────────────────────

/**
 * Fetch all active emergency alerts from Firestore.
 * @param {string} type - Filter by emergency type (optional)
 * @param {number} maxResults - Max number of results
 * @returns {Promise<Array>}
 */
export const getActiveEmergencyAlerts = async (type = null, maxResults = 20) => {
  try {
    let q;

    if (type) {
      q = query(
        collection(db, EMERGENCY_ALERTS_COLLECTION),
        where("status", "==", ALERT_STATUS.ACTIVE),
        where("type", "==", type),
        orderBy("timestamp", "desc"),
        firestoreLimit(maxResults)
      );
    } else {
      q = query(
        collection(db, EMERGENCY_ALERTS_COLLECTION),
        where("status", "==", ALERT_STATUS.ACTIVE),
        orderBy("timestamp", "desc"),
        firestoreLimit(maxResults)
      );
    }

    const snapshot = await getDocs(q);
    const alerts = [];

    snapshot.forEach((docSnap) => {
      alerts.push({ id: docSnap.id, ...docSnap.data() });
    });

    return alerts;
  } catch (err) {
    console.error("[emergencyService.getActiveEmergencyAlerts] Error:", err);
    return [];
  }
};

/**
 * Get all emergency alerts for a specific user.
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
export const getUserEmergencyAlerts = async (userId) => {
  try {
    const q = query(
      collection(db, EMERGENCY_ALERTS_COLLECTION),
      where("userId", "==", userId),
      orderBy("timestamp", "desc"),
      firestoreLimit(50)
    );

    const snapshot = await getDocs(q);
    const alerts = [];

    snapshot.forEach((docSnap) => {
      alerts.push({ id: docSnap.id, ...docSnap.data() });
    });

    return alerts;
  } catch (err) {
    console.error("[emergencyService.getUserEmergencyAlerts] Error:", err);
    return [];
  }
};

/**
 * Update the status of an emergency alert.
 * @param {string} alertId - Firestore document ID
 * @param {string} status - New status from ALERT_STATUS
 */
export const updateAlertStatus = async (alertId, status) => {
  try {
    const alertRef = doc(db, EMERGENCY_ALERTS_COLLECTION, alertId);
    await updateDoc(alertRef, {
      status,
      updatedAt: serverTimestamp(),
    });
    console.log("[emergencyService.updateAlertStatus] Alert", alertId, "updated to:", status);
  } catch (err) {
    console.error("[emergencyService.updateAlertStatus] Error:", err);
    throw err;
  }
};

/**
 * Subscribe to real-time emergency alert updates.
 * @param {Function} callback - Called with updated alerts array on each change
 * @returns {Function} - Unsubscribe function
 */
export const subscribeToEmergencyAlerts = (callback) => {
  const q = query(
    collection(db, EMERGENCY_ALERTS_COLLECTION),
    where("status", "==", ALERT_STATUS.ACTIVE),
    orderBy("timestamp", "desc"),
    firestoreLimit(20)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const alerts = [];
    snapshot.forEach((docSnap) => {
      alerts.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(alerts);
  }, (err) => {
    console.error("[emergencyService.subscribeToEmergencyAlerts] Error:", err);
  });

  return unsubscribe;
};

// ─── Firestore: shelters ──────────────────────────────────────────────────────

/**
 * Fetch nearby emergency shelters from Firestore.
 * @param {Object} userLocation - { lat, lng }
 * @param {number} maxResults - Max number of shelters to return
 * @returns {Promise<Array>}
 */
export const getNearbyShelters = async (userLocation = null, maxResults = 10) => {
  try {
    const q = query(
      collection(db, SHELTERS_COLLECTION),
      where("isActive", "==", true),
      firestoreLimit(maxResults)
    );

    const snapshot = await getDocs(q);
    const shelters = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      shelters.push({ id: docSnap.id, ...data });
    });

    // If user location is available, sort by proximity
    if (userLocation && userLocation.lat && userLocation.lng) {
      shelters.sort((a, b) => {
        const distA = calculateDistance(userLocation, a.location || {});
        const distB = calculateDistance(userLocation, b.location || {});
        return distA - distB;
      });
    }

    return shelters;
  } catch (err) {
    console.error("[emergencyService.getNearbyShelters] Error:", err);
    return [];
  }
};

/**
 * Get all shelters filtered by disaster type.
 * @param {string} disasterType - Type from EMERGENCY_TYPES
 * @returns {Promise<Array>}
 */
export const getSheltersByType = async (disasterType) => {
  try {
    const q = query(
      collection(db, SHELTERS_COLLECTION),
      where("supportedDisasters", "array-contains", disasterType),
      where("isActive", "==", true),
      firestoreLimit(20)
    );

    const snapshot = await getDocs(q);
    const shelters = [];

    snapshot.forEach((docSnap) => {
      shelters.push({ id: docSnap.id, ...docSnap.data() });
    });

    return shelters;
  } catch (err) {
    console.error("[emergencyService.getSheltersByType] Error:", err);
    return [];
  }
};

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Calculate distance in km between two lat/lng coordinates (Haversine formula).
 * @param {{ lat: number, lng: number }} point1
 * @param {{ lat: number, lng: number }} point2
 * @returns {number} - Distance in km
 */
export const calculateDistance = (point1, point2) => {
  if (!point1?.lat || !point1?.lng || !point2?.lat || !point2?.lng) return Infinity;

  const R = 6371; // Earth's radius in km
  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Format an emergency alert for display.
 * @param {Object} alert - Raw alert from Firestore
 * @returns {Object} - Formatted alert
 */
export const formatAlert = (alert) => {
  return {
    ...alert,
    typeLabel: alert.type
      ? alert.type.charAt(0).toUpperCase() + alert.type.slice(1)
      : "Unknown",
    severityLabel: alert.severity
      ? alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)
      : "Unknown",
    timeAgo: alert.createdAt
      ? getTimeAgo(new Date(alert.createdAt))
      : "Unknown time",
  };
};

/**
 * Get human-readable relative time string.
 * @param {Date} date
 * @returns {string}
 */
const getTimeAgo = (date) => {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
};
