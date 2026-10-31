import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useState } from "react";
import { createContext } from "react";
import { provider, auth } from "./firebase";
import axiosInstance from "./axiosinstance";
import { useEffect, useContext, useCallback, useRef } from "react";
import OtpDialog from "@/components/OtpDialog";
import { getDeviceId } from "./deviceId";

const UserContext = createContext();
const DUPLICATE_LOGIN_WINDOW_MS = 15000;

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [otp, setOtp] = useState(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const lastLoginAttempt = useRef({ email: null, at: 0 });

  const login = (data) => {
    const userdata = data?.result || data;
    setUser(userdata);
    setAuthError("");
    localStorage.setItem("user", JSON.stringify(userdata));
    if (data?.token) {
      localStorage.setItem("token", data.token);
    }
  };

  const logout = async () => {
    setUser(null);
    setOtp(null);
    setAuthError("");
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const requestSession = useCallback(async (firebaseuser) => {
    const email = firebaseuser?.email;
    if (!email) return;

    const now = Date.now();
    if (
      lastLoginAttempt.current.email === email &&
      now - lastLoginAttempt.current.at < DUPLICATE_LOGIN_WINDOW_MS
    ) {
      return;
    }
    lastLoginAttempt.current = { email, at: now };

    // The signed ID token is what proves identity to the backend. The backend
    // reads the email from this token and never trusts an email sent in the body.
    const idToken = await firebaseuser.getIdToken();

    const response = await axiosInstance.post("/user/login", {
      idToken,
      name: firebaseuser.displayName,
      image: firebaseuser.photoURL || "https://github.com/shadcn.png",
      deviceId: getDeviceId(),
    });

    if (response.data?.requiresOtp) {
      setAuthError("");
      setOtp({
        challengeId: response.data.challengeId,
        destination: response.data.destination,
        city: response.data.city,
        state: response.data.state,
        error: null,
      });
      return;
    }

    setOtp(null);
    login(response.data);
  }, []);

  const handlegooglesignin = async () => {
    setAuthError("");
    try {
      const result = await signInWithPopup(auth, provider);
      await requestSession(result.user);
    } catch (error) {
      if (error?.code === "auth/popup-closed-by-user") return;
      setAuthError(
        error?.response?.data?.message ||
          "Sign in failed. Please check your connection and try again."
      );
    }
  };

  const submitOtp = async (code) => {
    if (!otp?.challengeId) return;
    setOtpSubmitting(true);
    try {
      const response = await axiosInstance.post("/user/verify-otp", {
        challengeId: otp.challengeId,
        code,
      });
      setOtp(null);
      login(response.data);
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        "Verification failed. Please try again.";
      setOtp((current) => (current ? { ...current, error: message } : current));
    } finally {
      setOtpSubmitting(false);
    }
  };

  const resendOtp = async () => {
    if (!otp?.challengeId) return;
    setOtpSubmitting(true);
    try {
      await axiosInstance.post("/user/otp/resend", {
        challengeId: otp.challengeId,
      });
      setOtp((current) =>
        current ? { ...current, error: null, notice: "A new code is on its way." } : current
      );
    } catch (error) {
      const data = error?.response?.data;
      setOtp((current) =>
        current
          ? {
              ...current,
              error:
                data?.message || "We could not resend the code. Please try again.",
              notice: null,
            }
          : current
      );
    } finally {
      setOtpSubmitting(false);
    }
  };

  const cancelOtp = () => {
    setOtp(null);
    lastLoginAttempt.current = { email: null, at: 0 };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseuser) => {
      if (firebaseuser) {
        try {
          await requestSession(firebaseuser);
        } catch (error) {
          // A rate limited or unreachable login must not leave the app in a
          // half-signed-in state: drop the local session and surface the reason.
          setAuthError(
            error?.response?.data?.message ||
              "We could not verify this sign-in. Please try again."
          );
          logout();
        }
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        login,
        logout,
        handlegooglesignin,
        submitOtp,
        resendOtp,
        cancelOtp,
      }}
    >
      {children}
      <OtpDialog
        open={Boolean(otp)}
        destination={otp?.destination}
        city={otp?.city}
        state={otp?.state}
        error={otp?.error}
        notice={otp?.notice}
        submitting={otpSubmitting}
        onSubmit={submitOtp}
        onResend={resendOtp}
        onCancel={cancelOtp}
      />
      {authError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg"
        >
          <p className="m-0">{authError}</p>
          <button
            type="button"
            onClick={() => setAuthError("")}
            className="mt-2 cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-red-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);