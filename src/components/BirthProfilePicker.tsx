"use client";

import { useEffect, useState } from "react";
import {
  createBirthProfile,
  deleteBirthProfile,
  updateBirthProfile,
  type BirthProfile,
  type BirthProfileInput,
} from "@/lib/birth-profiles";
import { getBirthProfiles, saveBirthProfiles } from "@/lib/storage";

/**
 * Phase 5 (5.2): saved birth profiles, local-only. A select fills
 * the form it sits on with one tap; the manage block below it saves
 * the form's current details under a name, renames, or deletes.
 * Profiles live in localStorage only, never on the server.
 */
export default function BirthProfilePicker({
  current,
  onSelect,
  label,
}: {
  current: BirthProfileInput;
  onSelect: (profile: BirthProfile) => void;
  label: string;
}) {
  const [profiles, setProfiles] = useState<BirthProfile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setProfiles(getBirthProfiles()));
  }, []);

  const persist = (next: BirthProfile[]) => {
    setProfiles(next);
    saveBirthProfiles(next);
  };

  return (
    <div className="rounded-2xl border border-gold/20 bg-panel/50 p-4">
      <label htmlFor={`birth-profile-${label}`} className="mb-1.5 block text-sm font-medium text-cream">
        Saved birth profile
      </label>
      <select
        id={`birth-profile-${label}`}
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          setSelectedId(id);
          const found = profiles.find((p) => p.id === id);
          if (found) onSelect(found);
        }}
        className="w-full rounded-xl border border-gold/25 bg-panel px-4 py-2.5 text-cream"
      >
        <option value="">Use a saved profile…</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.date}
            {p.preset ? ` · ${p.preset}` : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-mist">
        One tap fills the birth details below. Profiles stay on this device only.
      </p>
      <button
        type="button"
        onClick={() => setManageOpen((v) => !v)}
        aria-expanded={manageOpen}
        className="mt-3 text-sm font-semibold text-goldbright underline"
      >
        {manageOpen ? "Hide profile manager" : "Manage saved profiles"}
      </button>
      {manageOpen && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`birth-profile-name-${label}`} className="sr-only">
              Name for this profile
            </label>
            <input
              id={`birth-profile-name-${label}`}
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setSaveError(null);
                setSaveOk(false);
              }}
              placeholder='Save current details as… e.g. "Me"'
              maxLength={60}
              className="w-full flex-1 rounded-xl border border-gold/25 bg-panel/70 px-4 py-2.5 text-cream placeholder:text-mist"
            />
            <button
              type="button"
              onClick={() => {
                const res = createBirthProfile(profiles, { ...current, name: newName });
                if (res.error || !res.profile) {
                  setSaveError(res.error ?? "Could not save this profile.");
                  return;
                }
                persist(res.profiles);
                setNewName("");
                setSaveOk(true);
              }}
              className="shrink-0 rounded-xl border border-gold/40 px-4 py-2.5 text-sm font-semibold text-goldbright"
            >
              Save profile
            </button>
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-danger">{saveError}</p>
          )}
          {saveOk && (
            <p className="text-sm text-goldbright">Profile saved on this device.</p>
          )}
          {profiles.length > 0 && (
            <ul className="space-y-2">
              {profiles.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/15 bg-panel/40 px-3 py-2"
                >
                  {editingId === p.id ? (
                    <>
                      <label htmlFor={`birth-profile-rename-${p.id}`} className="sr-only">
                        Rename profile
                      </label>
                      <input
                        id={`birth-profile-rename-${p.id}`}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={60}
                        className="min-w-0 flex-1 rounded-lg border border-gold/25 bg-panel/70 px-3 py-2.5 min-h-[44px] text-sm text-cream"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          persist(updateBirthProfile(profiles, p.id, { name: editName }));
                          setEditingId(null);
                        }}
                        className="rounded-lg border border-gold/40 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-goldbright"
                      >
                        Save name
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-gold/25 px-3 py-2.5 min-h-[44px] text-xs text-cream/80"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 text-sm text-cream">
                        {p.name} · {p.date}
                        {p.preset ? ` · ${p.preset}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditName(p.name);
                        }}
                        className="rounded-lg border border-gold/40 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-goldbright"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (armedDeleteId !== p.id) {
                            setArmedDeleteId(p.id);
                            return;
                          }
                          persist(deleteBirthProfile(profiles, p.id));
                          setArmedDeleteId(null);
                          if (selectedId === p.id) setSelectedId("");
                        }}
                        className="rounded-lg border border-danger/30 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-danger"
                      >
                        {armedDeleteId === p.id ? "Confirm delete?" : "Delete"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
