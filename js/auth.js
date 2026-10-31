
"use strict";

// Timidy Store — Authentication

const TimidyAuth = (() => {
  const db = window.timidySupabase;

  if (!db) {
    throw new Error("Supabase client is not configured.");
  }

  const LOGIN_PAGE = "login.html";

  async function getAuthorizedUser() {
    const { data: userData, error: userError } =
      await db.auth.getUser();

    if (userError || !userData.user) {
      return null;
    }

    // The database function checks whether the
    // authenticated user's UID is in store_admins.
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

    return allowed === true ? userData.user : null;
  }

  async function requireAdmin() {
    try {
      const user = await getAuthorizedUser();

      if (!user) {
        window.location.replace(LOGIN_PAGE);
        return null;
      }

      document.documentElement.style.visibility = "visible";
      return user;
    } catch (error) {
      console.error(error);
      window.location.replace(LOGIN_PAGE);
      return null;
    }
  }

  async function login(email, password) {
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
      await db.auth.signOut();
      throw error;
    }

    if (!user) {
      await db.auth.signOut();
      throw new Error(
        "This account is not authorized to access Timidy Store."
      );
    }

    return user;
  }

  async function logout() {
    const { error } = await db.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }

    window.location.replace(LOGIN_PAGE);
  }

  return {
    getAuthorizedUser,
    requireAdmin,
    login,
    logout
  };
})();

window.TimidyAuth = TimidyAuth;
