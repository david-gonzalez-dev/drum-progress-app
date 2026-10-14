// The ONE place that says what each age band means for the app. The band itself is worked out on the server from the date of birth
// (see supabase/date-of-birth.sql); the app never calculates an age or sees a date of birth after it is entered.
// These are STARTING defaults only: nothing here limits what a student can practise, and the student can change difficulty and library later.
import type { Difficulty } from "./rudiment-grid";

// Band names are kept for the database: "under_10" now means up to 10 years old, "10_13" means 11 to 14, "14_17" means 15 to 17 (see supabase/age-bands-11-14.sql).
export type AgeBand = "under_10" | "10_13" | "14_17" | "18_plus";

export const AGE_CONFIG: Record<AgeBand, { difficulty: Difficulty; essentials: boolean; unlockMinutes: number }> = {
  under_10: { difficulty: "beginner", essentials: true, unlockMinutes: 1 },
  "10_13": { difficulty: "developing", essentials: true, unlockMinutes: 1 },
  "14_17": { difficulty: "standard", essentials: false, unlockMinutes: 2 },
  "18_plus": { difficulty: "standard", essentials: false, unlockMinutes: 2 },
};

export function asAgeBand(value: unknown): AgeBand | null {
  return value === "under_10" || value === "10_13" || value === "14_17" || value === "18_plus" ? value : null;
}
// The three leaderboard categories (10_13 and 14_17 share the 10-17 board). The server decides; this is only for labels in the app.
export type LeaderboardBoard = "under_10" | "10_17" | "18_plus";
