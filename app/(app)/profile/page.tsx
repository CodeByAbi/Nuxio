"use client";

import { useEffect, useRef, useState, useCallback, type DragEvent, type ChangeEvent, type FormEvent } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProfileData {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

type FetchState = "idle" | "loading" | "success" | "error";
type SaveState = "idle" | "saving" | "success" | "error";
type AvatarState = "idle" | "uploading" | "success" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_NAME_LENGTH = 50;

// ─── Skeleton Component ───────────────────────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div className="profile-skeleton" aria-busy="true" aria-label="Loading profile…">
      <div className="skeleton-avatar" />
      <div className="skeleton-field" />
      <div className="skeleton-field skeleton-field--short" />
    </div>
  );
}

// ─── Avatar Widget ────────────────────────────────────────────────────────────
interface AvatarWidgetProps {
  currentUrl: string | null;
  displayName: string;
  uploadState: AvatarState;
  uploadError: string | null;
  onFileSelected: (file: File) => void;
}

function AvatarWidget({ currentUrl, displayName, uploadState, uploadError, onFileSelected }: AvatarWidgetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);

  const handleFile = useCallback(
    (file: File) => {
      // Optimistic preview
      const localUrl = URL.createObjectURL(file);
      setPreviewUrl(localUrl);
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected after an error
    e.target.value = "";
  };

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="avatar-widget">
      <button
        type="button"
        id="avatar-upload-trigger"
        className={`avatar-drop-zone ${isDragging ? "avatar-drop-zone--dragging" : ""} ${uploadState === "uploading" ? "avatar-drop-zone--uploading" : ""}`}
        aria-label="Upload avatar — click or drag an image here"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        disabled={uploadState === "uploading"}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={`${displayName}'s avatar`} className="avatar-image" />
        ) : (
          <span className="avatar-initials" aria-hidden="true">
            {initials || "?"}
          </span>
        )}
        <div className="avatar-overlay" aria-hidden="true">
          {uploadState === "uploading" ? (
            <span className="avatar-overlay__icon">⏳</span>
          ) : (
            <span className="avatar-overlay__icon">📷</span>
          )}
        </div>
      </button>

      <input
        ref={inputRef}
        id="avatar-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="avatar-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />

      <p className="avatar-hint">JPEG, PNG or WebP · max 2 MB</p>

      {uploadState === "uploading" && <p className="avatar-status avatar-status--loading">Uploading…</p>}
      {uploadState === "success" && <p className="avatar-status avatar-status--success">Avatar updated!</p>}
      {uploadState === "error" && uploadError && <p className="avatar-status avatar-status--error">{uploadError}</p>}
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // ── Fetch profile on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/profile")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 404) {
            setFetchError(
              "Your profile hasn't been set up yet. It will be created automatically when you complete onboarding. Please check back shortly.",
            );
          } else if (res.status === 401) {
            setFetchError("You need to be logged in to view this page.");
          } else {
            setFetchError(json?.error?.message ?? "Failed to load profile. Please refresh and try again.");
          }
          setFetchState("error");
        } else {
          const data: ProfileData = json.data;
          setProfile(data);
          setDisplayName(data.display_name);
          setFetchState("success");
        }
      })
      .catch(() => {
        setFetchError("A network error occurred. Please check your connection and try again.");
        setFetchState("error");
      });
  }, []);

  // ── Client-side validation ─────────────────────────────────────────────
  const validateName = (value: string): string | null => {
    if (!value.trim()) return "Display name cannot be empty.";
    if (value.length > MAX_NAME_LENGTH) return `Display name must be ${MAX_NAME_LENGTH} characters or fewer.`;
    return null;
  };

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDisplayName(val);
    if (nameError) setNameError(validateName(val));
  };

  // ── Save display name ──────────────────────────────────────────────────
  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validationErr = validateName(displayName);
    if (validationErr) {
      setNameError(validationErr);
      return;
    }
    setNameError(null);
    setSaveState("saving");
    setSaveError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json?.error?.message ?? "Failed to save. Please try again.");
        setSaveState("error");
      } else {
        setProfile(json.data);
        setDisplayName(json.data.display_name);
        setSaveState("success");
        setTimeout(() => setSaveState("idle"), 2500);
      }
    } catch {
      setSaveError("A network error occurred. Please try again.");
      setSaveState("error");
    }
  };

  // ── Upload avatar ──────────────────────────────────────────────────────
  const handleFileSelected = useCallback(async (file: File) => {
    setAvatarState("uploading");
    setAvatarError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setAvatarError(json?.error?.message ?? "Upload failed. Please try again.");
        setAvatarState("error");
      } else {
        setProfile((prev) => (prev ? { ...prev, avatar_url: json.data.avatar_url } : prev));
        setAvatarState("success");
        setTimeout(() => setAvatarState("idle"), 2500);
      }
    } catch {
      setAvatarError("A network error occurred during upload. Please try again.");
      setAvatarState("error");
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  const isDirty = profile && displayName !== profile.display_name;

  return (
    <>
      <style>{`
        /* ─── Page ─────────────────────────────────────────────── */
        .profile-page {
          min-height: 100vh;
          background: hsl(220 14% 96%);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: clamp(2rem, 6vw, 5rem) 1rem;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .profile-card {
          background: #fff;
          border-radius: 1.5rem;
          box-shadow:
            0 1px 2px hsl(220 14% 10% / 0.06),
            0 4px 16px hsl(220 14% 10% / 0.08);
          width: 100%;
          max-width: 480px;
          padding: clamp(1.75rem, 5vw, 2.5rem);
        }
        .profile-card__heading {
          font-size: 1.375rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: hsl(220 16% 12%);
          margin: 0 0 0.25rem;
        }
        .profile-card__subheading {
          font-size: 0.875rem;
          color: hsl(220 10% 52%);
          margin: 0 0 2rem;
        }
        .profile-divider {
          border: none;
          border-top: 1px solid hsl(220 14% 92%);
          margin: 1.75rem 0;
        }

        /* ─── Skeleton ─────────────────────────────────────────── */
        @keyframes shimmer {
          from { background-position: -200% 0; }
          to   { background-position:  200% 0; }
        }
        .profile-skeleton {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 1rem 0;
        }
        .skeleton-avatar,
        .skeleton-field {
          background: linear-gradient(
            90deg,
            hsl(220 14% 92%) 25%,
            hsl(220 14% 96%) 50%,
            hsl(220 14% 92%) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
          border-radius: 9999px;
        }
        .skeleton-avatar {
          width: 96px;
          height: 96px;
        }
        .skeleton-field {
          width: 100%;
          height: 44px;
          border-radius: 0.75rem;
        }
        .skeleton-field--short {
          width: 60%;
        }

        /* ─── Error / empty state ──────────────────────────────── */
        .profile-error {
          text-align: center;
          padding: 2rem 0;
        }
        .profile-error__icon {
          font-size: 2.5rem;
          margin-bottom: 0.75rem;
        }
        .profile-error__title {
          font-size: 1rem;
          font-weight: 600;
          color: hsl(220 16% 12%);
          margin: 0 0 0.5rem;
        }
        .profile-error__message {
          font-size: 0.875rem;
          color: hsl(220 10% 52%);
          line-height: 1.6;
          margin: 0;
        }

        /* ─── Avatar widget ─────────────────────────────────────── */
        .avatar-widget {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }
        .avatar-drop-zone {
          position: relative;
          width: 96px;
          height: 96px;
          border-radius: 50%;
          border: 2.5px dashed hsl(220 14% 82%);
          background: hsl(220 14% 97%);
          cursor: pointer;
          transition: border-color 0.18s, background 0.18s, transform 0.12s;
          overflow: hidden;
          padding: 0;
          display: block;
        }
        .avatar-drop-zone:hover:not(:disabled) {
          border-color: hsl(238 70% 62%);
          background: hsl(238 70% 62% / 0.06);
          transform: scale(1.03);
        }
        .avatar-drop-zone:focus-visible {
          outline: 3px solid hsl(238 70% 62% / 0.5);
          outline-offset: 3px;
        }
        .avatar-drop-zone--dragging {
          border-color: hsl(238 70% 62%);
          background: hsl(238 70% 62% / 0.12);
        }
        .avatar-drop-zone--uploading {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .avatar-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .avatar-initials {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 700;
          color: hsl(220 10% 56%);
          letter-spacing: -0.03em;
        }
        .avatar-overlay {
          position: absolute;
          inset: 0;
          background: hsl(220 16% 8% / 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.18s;
        }
        .avatar-drop-zone:hover .avatar-overlay,
        .avatar-drop-zone--dragging .avatar-overlay {
          opacity: 1;
        }
        .avatar-overlay__icon {
          font-size: 1.5rem;
        }
        .avatar-file-input {
          position: absolute;
          inset: 0;
          opacity: 0;
          pointer-events: none;
          width: 0;
          height: 0;
        }
        .avatar-hint {
          font-size: 0.75rem;
          color: hsl(220 10% 60%);
          margin: 0;
        }
        .avatar-status {
          font-size: 0.8125rem;
          margin: 0;
        }
        .avatar-status--loading { color: hsl(238 60% 60%); }
        .avatar-status--success { color: hsl(150 60% 40%); }
        .avatar-status--error   { color: hsl(0 70% 54%); }

        /* ─── Form ──────────────────────────────────────────────── */
        .profile-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .form-label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: hsl(220 14% 28%);
          letter-spacing: 0.01em;
        }
        .form-input-wrap {
          position: relative;
        }
        .form-input {
          width: 100%;
          height: 44px;
          border-radius: 0.75rem;
          border: 1.5px solid hsl(220 14% 88%);
          background: hsl(220 14% 98%);
          padding: 0 3rem 0 0.875rem;
          font-size: 0.9375rem;
          color: hsl(220 16% 12%);
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
          outline: none;
          font-family: inherit;
        }
        .form-input:focus {
          border-color: hsl(238 70% 62%);
          box-shadow: 0 0 0 3px hsl(238 70% 62% / 0.14);
        }
        .form-input--error {
          border-color: hsl(0 70% 54%);
        }
        .form-input--error:focus {
          box-shadow: 0 0 0 3px hsl(0 70% 54% / 0.14);
        }
        .form-input-count {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.75rem;
          color: hsl(220 10% 60%);
          pointer-events: none;
          user-select: none;
        }
        .form-input-count--warn {
          color: hsl(30 80% 50%);
        }
        .form-input-count--error {
          color: hsl(0 70% 54%);
        }
        .form-error {
          font-size: 0.8125rem;
          color: hsl(0 70% 54%);
          margin: 0;
        }

        /* ─── Save button ───────────────────────────────────────── */
        .save-btn {
          height: 44px;
          border-radius: 0.75rem;
          border: none;
          background: hsl(238 70% 62%);
          color: #fff;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s, opacity 0.15s;
          letter-spacing: 0.01em;
          font-family: inherit;
        }
        .save-btn:hover:not(:disabled) {
          background: hsl(238 70% 56%);
          transform: translateY(-1px);
        }
        .save-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .save-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .save-btn--success {
          background: hsl(150 60% 44%);
        }
        .save-row {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .save-feedback {
          font-size: 0.8125rem;
          text-align: center;
          margin: 0;
        }
        .save-feedback--success { color: hsl(150 60% 40%); }
        .save-feedback--error   { color: hsl(0 70% 54%); }
      `}</style>

      <div className="profile-page">
        <div className="profile-card">
          <h1 className="profile-card__heading">Your Profile</h1>
          <p className="profile-card__subheading">Manage how you appear in Nuxio.</p>

          {/* ── Loading ─────────────────────────────────────────────── */}
          {fetchState === "loading" && <ProfileSkeleton />}

          {/* ── Error ───────────────────────────────────────────────── */}
          {fetchState === "error" && (
            <div className="profile-error" role="alert" aria-live="polite">
              <div className="profile-error__icon">😕</div>
              <p className="profile-error__title">Profile unavailable</p>
              <p className="profile-error__message">{fetchError}</p>
            </div>
          )}

          {/* ── Success ─────────────────────────────────────────────── */}
          {fetchState === "success" && profile && (
            <>
              <AvatarWidget
                currentUrl={profile.avatar_url}
                displayName={profile.display_name}
                uploadState={avatarState}
                uploadError={avatarError}
                onFileSelected={handleFileSelected}
              />

              <hr className="profile-divider" />

              <form className="profile-form" onSubmit={handleSave} noValidate>
                {/* Email (read-only) */}
                <div className="form-field">
                  <label className="form-label" htmlFor="profile-email">
                    Account ID
                  </label>
                  <div className="form-input-wrap">
                    <input
                      id="profile-email"
                      type="text"
                      className="form-input"
                      value={profile.id}
                      readOnly
                      aria-readonly="true"
                      tabIndex={-1}
                      style={{ color: "hsl(220 10% 56%)", cursor: "default" }}
                    />
                  </div>
                </div>

                {/* Display name */}
                <div className="form-field">
                  <label className="form-label" htmlFor="profile-display-name">
                    Display name <span aria-hidden="true">*</span>
                  </label>
                  <div className="form-input-wrap">
                    <input
                      id="profile-display-name"
                      type="text"
                      className={`form-input${nameError ? " form-input--error" : ""}`}
                      value={displayName}
                      onChange={handleNameChange}
                      maxLength={MAX_NAME_LENGTH + 5}
                      aria-required="true"
                      aria-invalid={!!nameError}
                      aria-describedby={nameError ? "name-error" : "name-count"}
                      autoComplete="name"
                    />
                    <span
                      id="name-count"
                      className={`form-input-count${
                        displayName.length > MAX_NAME_LENGTH
                          ? " form-input-count--error"
                          : displayName.length > MAX_NAME_LENGTH - 10
                            ? " form-input-count--warn"
                            : ""
                      }`}
                      aria-live="polite"
                    >
                      {displayName.length}/{MAX_NAME_LENGTH}
                    </span>
                  </div>
                  {nameError && (
                    <p id="name-error" className="form-error" role="alert">
                      {nameError}
                    </p>
                  )}
                </div>

                {/* Save row */}
                <div className="save-row">
                  <button
                    id="profile-save-btn"
                    type="submit"
                    className={`save-btn${saveState === "success" ? " save-btn--success" : ""}`}
                    disabled={saveState === "saving" || (!isDirty && saveState !== "error")}
                    aria-busy={saveState === "saving"}
                  >
                    {saveState === "saving" ? "Saving…" : saveState === "success" ? "✓ Saved!" : "Save changes"}
                  </button>

                  {saveState === "success" && (
                    <p className="save-feedback save-feedback--success" role="status">
                      Your profile has been updated.
                    </p>
                  )}
                  {saveState === "error" && saveError && (
                    <p className="save-feedback save-feedback--error" role="alert">
                      {saveError}
                    </p>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
