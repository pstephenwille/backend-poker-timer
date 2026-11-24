import type { Leaderboard } from "./leaderboard.ts";
import type { Logout } from "./logout.ts";
import type { Me } from "./me.ts";
import type { MemberProfile, Members } from "./members.ts";

const ANN_ID = "6f1c2a9e-3b7d-4e8a-9c1f-2d5b8e7a4c31";
const BOB_ID = "b42e9d17-8c3a-4f6b-a2e5-7d1c9f0b3e68";
const CAL_ID = "d9a3c5e1-7f2b-4c8d-b6e4-1a0f3c5e7b92";
const ANN_AVATAR = "https://lh3.googleusercontent.com/a/ann-example";
const BOB_AVATAR = "https://lh3.googleusercontent.com/a/bob-example";

export const members: Members = [
  { id: ANN_ID, displayName: "Ann.AllIn", avatarUrl: ANN_AVATAR, active: true },
  { id: BOB_ID, displayName: "Bob Jones", avatarUrl: BOB_AVATAR, active: true },
  { id: CAL_ID, displayName: "cal", avatarUrl: null, active: false },
];

export const memberProfile: MemberProfile = {
  id: ANN_ID,
  displayName: "Ann.AllIn",
  username: "Ann.AllIn",
  avatarUrl: ANN_AVATAR,
  active: true,
};

export const leaderboard: Leaderboard = [
  {
    userId: ANN_ID,
    displayName: "Ann.AllIn",
    avatarUrl: ANN_AVATAR,
    rank: 1,
    wins: 0,
    tournamentsPlayed: 0,
  },
  {
    userId: BOB_ID,
    displayName: "Bob Jones",
    avatarUrl: BOB_AVATAR,
    rank: 1,
    wins: 0,
    tournamentsPlayed: 0,
  },
  {
    userId: CAL_ID,
    displayName: "cal",
    avatarUrl: null,
    rank: 1,
    wins: 0,
    tournamentsPlayed: 0,
  },
];

export const me: Me = {
  id: ANN_ID,
  email: "ann@example.com",
  isAdmin: false,
  username: "Ann.AllIn",
  displayName: "Ann.AllIn",
  avatarUrl: ANN_AVATAR,
};

export const logout: Logout = {
  signOutUrl:
    "https://poker-timer-dev-512808912517.auth.us-east-1.amazoncognito.com/logout?client_id=example&logout_uri=https%3A%2F%2Fdev.example.test%2F",
};
