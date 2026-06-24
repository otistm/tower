/** Server endpoint. Override with VITE_SERVER_URL at build/dev time. */
export const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "ws://localhost:2567";

export const ROOM_NAME = "tower";
