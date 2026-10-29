const userIdKey = "pagerwho.currentUserId";
const projectIdKey = "pagerwho.currentProjectId";
const sessionChangeEvent = "pagerwho-session-change";

export function getStoredUserId() {
  return localStorage.getItem(userIdKey) || undefined;
}

export function getStoredProjectId() {
  return localStorage.getItem(projectIdKey) || undefined;
}

export function setStoredUserId(userId: string) {
  localStorage.setItem(userIdKey, userId);
  window.dispatchEvent(new Event(sessionChangeEvent));
}

export function setStoredProjectId(projectId: string) {
  localStorage.setItem(projectIdKey, projectId);
  window.dispatchEvent(new Event(sessionChangeEvent));
}

export function clearStoredSession() {
  localStorage.removeItem(userIdKey);
  localStorage.removeItem(projectIdKey);
  window.dispatchEvent(new Event(sessionChangeEvent));
}

export function clearStoredProject() {
  localStorage.removeItem(projectIdKey);
  window.dispatchEvent(new Event(sessionChangeEvent));
}

export function subscribeToSessionChange(listener: () => void) {
  window.addEventListener(sessionChangeEvent, listener);

  return () => window.removeEventListener(sessionChangeEvent, listener);
}
