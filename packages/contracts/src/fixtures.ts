import type { Leaderboard } from "./leaderboard.ts";
import type { Logout } from "./logout.ts";
import type { Me } from "./me.ts";

export const leaderboard: Leaderboard = [
  {
    userId: "6f1c2a9e-3b7d-4e8a-9c1f-2d5b8e7a4c31",
    rank: 1,
    wins: 0,
    tournamentsPlayed: 0,
  },
  {
    userId: "b42e9d17-8c3a-4f6b-a2e5-7d1c9f0b3e68",
    rank: 1,
    wins: 0,
    tournamentsPlayed: 0,
  },
];

export const me: Me = {
  id: "6f1c2a9e-3b7d-4e8a-9c1f-2d5b8e7a4c31",
  email: "ann@example.com",
  isAdmin: false,
};

export const logout: Logout = {
  signOutUrl:
    "https://poker-timer-dev-512808912517.auth.us-east-1.amazoncognito.com/logout?client_id=example&logout_uri=https%3A%2F%2Fdev.example.test%2F",
};
