
"use strict";

// =====================================
// TIMIDY STORE — AUTHENTICATION
// Shared authorization checks
// =====================================

const TimidyAuth = (() => {
  const db = window.timidySupabase;

  if (!db) {
    throw new Error(
      "Supabase client is not configured."
    );
  }

  const LOGIN_PAGE = "login.html";

  // Only reuse successful authorization briefly.
  // Database RLS remains the final authority
  // for every protected data operation.
  const CACHE_DURATION = 5000;

  let cachedUser = null;
  let cachedAt = 0;
  let pendingCheck = null;
  let authGeneration = 0;

  function clearAuthorizationCache() {
    authGeneration++;
    cachedUser = null;
    cachedAt = 0;
    pendingCheck = null;
  }

  async function verifyAuthorizedUser() {
    const { data: userData, error: userError } =
      await db.auth.getUser();

    if (userError || !userData?.user) {
      return null;
    }

    const { data: allowed, error: adminError } =
      await db.rpc("is_store_admin");

    if (adminError) {
      console.error(
        "Administrator verification failed:",
        adminError.message
      );

      throw new Error(
        "Unable to verify administrator access."
      );
    }

    return allowed === true
      ? userData.user
      : null;
  }

  async function getAuthorizedUser() {
    const now = Date.now();

    if (
      cachedUser &&
      now - cachedAt < CACHE_DURATION
    ) {
      return cachedUser;
    }

    if (pendingCheck) {
      return pendingCheck;
    }

    const generation = authGeneration;

    const check = verifyAuthorizedUser()
      .then(user => {
        // Don't restore a cache cleared during
        // sign-in, sign-out, or auth changes.
        if (generation === authGeneration) {
          if (user) {
            cachedUser = user;
            cachedAt = Date.now();
          } else {
            cachedUser = null;
            cachedAt = 0;
          }
        }

        return user;
      });

    pendingCheck = check;

    try {
      return await check;
    } finally {
      if (pendingCheck === check) {
        pendingCheck = null;
      }
    }
  }

  async function requireAdmin() {
    try {
      const user = await getAuthorizedUser();

      if (!user) {
        window.location.replace(LOGIN_PAGE);
        return null;
      }

      document.documentElement.style.visibility =
        "visible";

      return user;
    } catch (error) {
      console.error(error);

      window.location.replace(LOGIN_PAGE);

      return null;
    }
  }

  async function login(email, password) {
    clearAuthorizationCache();

    const { error } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw new Error(error.message);
    }

    let user;

    try {
      user = await getAuthorizedUser();
    } catch (error) {
      clearAuthorizationCache();
      await db.auth.signOut();
      throw error;
    }

    if (!user) {
      clearAuthorizationCache();
      await db.auth.signOut();

      throw new Error(
        "This account is not authorized to access Timidy Store."
      );
    }

    return user;
  }

  async function logout() {
    clearAuthorizationCache();

    const { error } = await db.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }

    window.location.replace(LOGIN_PAGE);
  }

  // Clear cached authorization whenever
  // the Supabase session changes.
  db.auth.onAuthStateChange(() => {
    clearAuthorizationCache();
  });

  return {
    getAuthorizedUser,
    requireAdmin,
    login,
    logout,
    clearAuthorizationCache
  };
})();

window.TimidyAuth = TimidyAuth;
