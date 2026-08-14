// Safe browser storage helper to prevent runtime crashes if local storage is restricted or disabled
export const safeStorage = {
  getLocal(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage read blocked by browser permissions", e);
      return null;
    }
  },
  setLocal(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("localStorage write blocked by browser permissions", e);
    }
  },
  removeLocal(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("localStorage delete blocked by browser permissions", e);
    }
  },
  getSession(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      console.warn("sessionStorage read blocked by browser permissions", e);
      return null;
    }
  },
  setSession(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      console.warn("sessionStorage write blocked by browser permissions", e);
    }
  },
  removeSession(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      console.warn("sessionStorage delete blocked by browser permissions", e);
    }
  }
};
